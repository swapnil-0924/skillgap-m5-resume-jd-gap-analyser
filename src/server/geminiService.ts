import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AnalysisReport,
  LearningDayPlan,
  QuickScanResult,
  SkillCategory,
  SkillMatchResult,
  StructuredDocumentExtraction,
} from '../types/analysis.ts';
import { normalizeAndDeduplicateSkills } from '../analysis/skillTaxonomy.ts';

const FAST_MODEL = 'gemini-3.1-flash-lite';
const DEEP_MODEL = 'gemini-4-hydrogen';
const EMBEDDING_MODEL = 'gemini-embedding-2';

const ALLOWED_CATEGORIES = new Set<SkillCategory>([
  'programming_language',
  'framework',
  'library',
  'database',
  'cloud',
  'dev_tool',
  'technical_skill',
  'soft_skill',
  'qualification',
  'certification',
]);

let cachedClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Gemini API key is not configured on the server. Please configure GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function withRetry<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label: string,
  maxAttempts = 2
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, label);
    } catch (error: unknown) {
      lastError = error;
      const msg = String((error as { message?: string })?.message || '').toLowerCase();
      if (
        msg.includes('api_key_invalid') ||
        msg.includes('permission_denied') ||
        msg.includes('400') ||
        msg.includes('timed out')
      ) {
        throw error;
      }
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastError;
}

function safeJsonParse<T>(raw: string | undefined, fallbackMsg: string): T {
  if (!raw || !raw.trim()) {
    throw new Error(fallbackMsg);
  }
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned) as T;
}

/**
 * Multimodal OCR fallback for scanned / image-based / complex-layout PDFs.
 */
export async function extractPdfTextViaGeminiOcr(pdfBuffer: Buffer): Promise<string> {
  const ai = getAiClient();
  const base64Data = pdfBuffer.toString('base64');

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: FAST_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data,
              },
            },
            {
              text:
                'Perform accurate OCR and layout-aware text extraction on this PDF document. ' +
                'Preserve logical reading order across columns, headings, bullet points, and tables. ' +
                'Return ONLY the extracted plain text verbatim without adding commentary or inventing missing details.',
            },
          ],
        },
      }),
    30000,
    'PDF OCR extraction'
  );

  return (response.text || '').trim();
}

/**
 * Low-latency Job Description preview powered by gemini-3.1-flash-lite.
 */
export async function quickScanJobDescription(jdText: string): Promise<QuickScanResult> {
  const ai = getAiClient();
  const start = Date.now();

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: FAST_MODEL,
        contents: `Analyze this Job Description concisely and return its core metadata and top required skills.\n\nJOB DESCRIPTION:\n${jdText.slice(0, 12000)}`,
        config: {
          systemInstruction:
            'You are a fast, factual recruiting parser. Extract only what is explicitly stated in the job description. Never invent skills or years of experience.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              jobTitle: { type: Type.STRING, description: 'Detected role title' },
              companyName: { type: Type.STRING, description: 'Company name if stated, else empty string' },
              requiredYears: {
                type: Type.NUMBER,
                description: 'Minimum required years of experience if stated, or -1 if not specified',
              },
              seniorityLevel: {
                type: Type.STRING,
                description: 'Seniority level (Entry, Junior, Mid-level, Senior, Staff/Lead, or Unspecified)',
              },
              topSkills: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Up to 10 highest-priority skills explicitly required',
              },
              summary: {
                type: Type.STRING,
                description: 'One concise sentence summarizing the role focus',
              },
            },
            required: ['jobTitle', 'companyName', 'requiredYears', 'seniorityLevel', 'topSkills', 'summary'],
          },
        },
      }),
    20000,
    'Quick JD scan'
  );

  const parsed = safeJsonParse<{
    jobTitle: string;
    companyName: string;
    requiredYears: number;
    seniorityLevel: string;
    topSkills: string[];
    summary: string;
  }>(response.text, 'Empty response during quick JD scan.');

  return {
    jobTitle: parsed.jobTitle?.trim() || 'Target Role',
    companyName: parsed.companyName?.trim() || null,
    requiredYears:
      typeof parsed.requiredYears === 'number' && parsed.requiredYears >= 0
        ? parsed.requiredYears
        : null,
    seniorityLevel: parsed.seniorityLevel?.trim() || 'Unspecified',
    topSkills: Array.isArray(parsed.topSkills) ? parsed.topSkills.slice(0, 10) : [],
    summary: parsed.summary?.trim() || '',
    latencyMs: Date.now() - start,
  };
}

const DOCUMENT_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    jobTitle: {
      type: Type.STRING,
      description: 'Role title (for JD) or candidate headline role (for Resume)',
    },
    companyName: {
      type: Type.STRING,
      description: 'Hiring company name if present in JD, else empty string',
    },
    skills: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rawName: { type: Type.STRING, description: 'Exact skill name as written in the document' },
          category: {
            type: Type.STRING,
            description:
              'One of: programming_language, framework, library, database, cloud, dev_tool, technical_skill, soft_skill',
          },
          importance: {
            type: Type.STRING,
            description: 'For JD: required or preferred. For resume: required.',
          },
          evidenceQuote: {
            type: Type.STRING,
            description:
              'Short verbatim sentence or bullet snippet copied directly from the source document proving this skill is mentioned. Do not paraphrase.',
          },
        },
        required: ['rawName', 'category', 'importance', 'evidenceQuote'],
      },
    },
    qualifications: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Academic degrees or formal educational qualifications explicitly stated',
    },
    certifications: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Professional certifications explicitly stated (e.g., AWS Solutions Architect, PMP)',
    },
    experience: {
      type: Type.OBJECT,
      properties: {
        estimatedYears: {
          type: Type.NUMBER,
          description: 'Total relevant years of experience stated or calculated from dates, or -1 if absent',
        },
        seniorityLevel: {
          type: Type.STRING,
          description: 'Entry, Junior, Mid-level, Senior, Lead/Staff, Manager/Director, or Unspecified',
        },
        domains: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Up to 6 core functional or industry domains explicitly evidenced',
        },
        summary: {
          type: Type.STRING,
          description: '1-2 sentence factual summary of experience strictly from the document',
        },
      },
      required: ['estimatedYears', 'seniorityLevel', 'domains', 'summary'],
    },
  },
  required: ['jobTitle', 'companyName', 'skills', 'qualifications', 'certifications', 'experience'],
};

interface RawExtractionPayload {
  jobTitle: string;
  companyName: string;
  skills: Array<{
    rawName: string;
    category: string;
    importance: string;
    evidenceQuote: string;
  }>;
  qualifications: string[];
  certifications: string[];
  experience: {
    estimatedYears: number;
    seniorityLevel: string;
    domains: string[];
    summary: string;
  };
}

function sanitizeExtractionPayload(payload: RawExtractionPayload): StructuredDocumentExtraction {
  const validSkills = (Array.isArray(payload.skills) ? payload.skills : []).map((s) => {
    const cat = ALLOWED_CATEGORIES.has(s.category as SkillCategory)
      ? (s.category as SkillCategory)
      : 'technical_skill';
    return {
      rawName: String(s.rawName || '').trim(),
      category: cat,
      importance: (s.importance === 'preferred' ? 'preferred' : 'required') as 'required' | 'preferred',
      evidenceQuote: String(s.evidenceQuote || '').trim(),
    };
  });

  const normalizedSkills = normalizeAndDeduplicateSkills(validSkills);

  return {
    jobTitle: payload.jobTitle?.trim() || undefined,
    companyName: payload.companyName?.trim() || undefined,
    skills: normalizedSkills,
    qualifications: Array.isArray(payload.qualifications)
      ? payload.qualifications.map((q) => String(q).trim()).filter(Boolean)
      : [],
    certifications: Array.isArray(payload.certifications)
      ? payload.certifications.map((c) => String(c).trim()).filter(Boolean)
      : [],
    experience: {
      estimatedYears:
        typeof payload.experience?.estimatedYears === 'number' &&
        payload.experience.estimatedYears >= 0
          ? Math.round(payload.experience.estimatedYears * 10) / 10
          : null,
      seniorityLevel: payload.experience?.seniorityLevel?.trim() || 'Unspecified',
      domains: Array.isArray(payload.experience?.domains)
        ? payload.experience.domains.map((d) => String(d).trim()).filter(Boolean).slice(0, 8)
        : [],
      summary: payload.experience?.summary?.trim() || '',
    },
  };
}

async function runStructuredExtraction(
  documentType: 'resume' | 'jd',
  documentText: string
): Promise<StructuredDocumentExtraction> {
  const ai = getAiClient();
  const prompt =
    documentType === 'resume'
      ? `Extract ALL factual skills, technologies, tools, soft skills, educational qualifications, certifications, and experience details from the following RESUME.\n` +
        `Rules:\n` +
        `- Extract only what is genuinely evidenced in the resume. Never invent skills, degrees, or years.\n` +
        `- Include programming languages, frameworks, libraries, databases, cloud technologies, dev tools, domain technical skills, and soft skills.\n` +
        `- Keep each skill atomic (e.g., separate "React", "TypeScript", "PostgreSQL" instead of combining them).\n` +
        `- Copy a brief verbatim snippet from the resume into evidenceQuote.\n\n` +
        `RESUME TEXT:\n${documentText.slice(0, 20000)}`
      : `Extract ALL required and preferred skills, qualifications, certifications, and experience requirements from the following JOB DESCRIPTION.\n` +
        `Rules:\n` +
        `- Extract only what is explicitly stated in the JD. Never invent requirements.\n` +
        `- Mark must-have items as importance="required" and nice-to-have/bonus items as importance="preferred".\n` +
        `- Keep each skill atomic (separate individual languages, frameworks, databases, tools, and soft skills).\n` +
        `- For EVERY skill, copy the exact verbatim sentence or bullet point from the JD into evidenceQuote without paraphrasing.\n\n` +
        `JOB DESCRIPTION:\n${documentText.slice(0, 20000)}`;

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: FAST_MODEL,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a precision resume and job-description parser. Return strictly factual, atomic, deduplicated structured JSON grounded in the provided document text.',
          responseMimeType: 'application/json',
          responseSchema: DOCUMENT_EXTRACTION_SCHEMA,
        },
      }),
    25000,
    `Structured ${documentType} extraction`
  );

  const parsed = safeJsonParse<RawExtractionPayload>(
    response.text,
    `Failed to parse structured ${documentType} extraction response.`
  );

  return sanitizeExtractionPayload(parsed);
}

export async function extractStructuredResume(
  resumeText: string
): Promise<StructuredDocumentExtraction> {
  return runStructuredExtraction('resume', resumeText);
}

export async function extractStructuredJobDescription(
  jdText: string
): Promise<StructuredDocumentExtraction> {
  return runStructuredExtraction('jd', jdText);
}

export interface EmbeddingBatchResult {
  vectors: Map<string, number[]>;
  model: string;
  status: 'succeeded' | 'partial' | 'fallback' | 'skipped';
  requestedCount: number;
  embeddedCount: number;
  fallbackReason: string | null;
  latencyMs: number;
}

export type SkillEmbedClientFn = (params: {
  model: string;
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
}) => Promise<{ embeddings?: Array<{ values?: number[] }> }>;

/**
 * Generates semantic vector embeddings for skill names using gemini-embedding-2.
 *
 * IMPORTANT SDK BEHAVIOR (`@google/genai`):
 * `gemini-embedding-2` is a multimodal embedding model (`tIsMultimodalEmbeddingModel` = true).
 * Passing a plain `string[]` causes `@google/genai`'s `tContents()` to merge every string
 * into ONE single multi-part `Content` object, returning only 1 fused vector instead of N.
 * Passing an array of explicit `Content` objects (`{ role: 'user', parts: [{ text }] }`)
 * ensures `batchEmbedContents` embeds each skill independently and returns N vectors.
 *
 * If batch embedding still returns fewer vectors than requested, falls back to bounded
 * concurrent single-item embedding calls; if the provider is unreachable or errors,
 * returns an explicit `status: 'fallback'` with `fallbackReason` so the pipeline never
 * silently misreports lexical fallback as neural embeddings.
 */
export async function embedSkillNames(
  canonicalSkills: string[],
  options?: { embedFn?: SkillEmbedClientFn; timeoutMs?: number }
): Promise<EmbeddingBatchResult> {
  const startedAt = Date.now();
  const unique = Array.from(
    new Set(canonicalSkills.map((s) => s.trim()).filter(Boolean))
  );
  const vectors = new Map<string, number[]>();

  if (unique.length === 0) {
    return {
      vectors,
      model: EMBEDDING_MODEL,
      status: 'skipped',
      requestedCount: 0,
      embeddedCount: 0,
      fallbackReason: null,
      latencyMs: Date.now() - startedAt,
    };
  }

  const timeoutMs = options?.timeoutMs ?? 15000;
  const runEmbed: SkillEmbedClientFn =
    options?.embedFn ??
    (async (params) => {
      const ai = getAiClient();
      return ai.models.embedContent({
        model: params.model,
        contents: params.contents,
      });
    });

  const failureReasons: string[] = [];
  const batchSize = 32;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const contentItems = batch.map((skill) => ({
      role: 'user',
      parts: [{ text: skill }],
    }));

    let batchMapped = 0;
    try {
      const embedRes = await withTimeout(
        runEmbed({
          model: EMBEDDING_MODEL,
          contents: contentItems,
        }),
        timeoutMs,
        'Semantic skill embeddings'
      );

      const returnedEmbeddings = embedRes.embeddings || [];
      if (returnedEmbeddings.length === batch.length) {
        for (let idx = 0; idx < batch.length; idx++) {
          const values = returnedEmbeddings[idx]?.values;
          if (Array.isArray(values) && values.length > 0) {
            vectors.set(batch[idx].toLowerCase(), values);
            batchMapped += 1;
          }
        }
      } else {
        failureReasons.push(
          `Batch response count mismatch (expected ${batch.length}, received ${returnedEmbeddings.length})`
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      failureReasons.push(msg);
    }

    // If batch call failed or returned a mismatched count for multi-skill input,
    // attempt bounded-concurrency single-skill calls before falling back.
    if (batchMapped < batch.length) {
      const missingSkills = batch.filter((skill) => !vectors.has(skill.toLowerCase()));
      const concurrency = 6;
      let singleItemFatalError: string | null = null;

      for (let j = 0; j < missingSkills.length; j += concurrency) {
        const chunk = missingSkills.slice(j, j + concurrency);
        const settled = await Promise.allSettled(
          chunk.map(async (skill) => {
            const singleRes = await withTimeout(
              runEmbed({
                model: EMBEDDING_MODEL,
                contents: [{ role: 'user', parts: [{ text: skill }] }],
              }),
              Math.min(timeoutMs, 8000),
              `Single skill embedding (${skill})`
            );
            const values = singleRes.embeddings?.[0]?.values;
            if (!Array.isArray(values) || values.length === 0) {
              throw new Error(`Empty embedding vector returned for "${skill}"`);
            }
            return { skill, values };
          })
        );

        let chunkSuccess = 0;
        for (const item of settled) {
          if (item.status === 'fulfilled') {
            vectors.set(item.value.skill.toLowerCase(), item.value.values);
            chunkSuccess += 1;
          } else if (!singleItemFatalError) {
            singleItemFatalError =
              item.reason instanceof Error ? item.reason.message : String(item.reason);
          }
        }

        // Abort remaining chunks immediately if an entire chunk fails (e.g., auth/404/network error)
        if (chunkSuccess === 0 && singleItemFatalError) {
          failureReasons.push(singleItemFatalError);
          break;
        }
      }
    }
  }

  const latencyMs = Date.now() - startedAt;
  const embeddedCount = vectors.size;
  const requestedCount = unique.length;

  let status: EmbeddingBatchResult['status'];
  let fallbackReason: string | null = null;

  if (embeddedCount === requestedCount) {
    status = 'succeeded';
  } else if (embeddedCount > 0) {
    status = 'partial';
    fallbackReason =
      failureReasons[0] ||
      `Only ${embeddedCount}/${requestedCount} skills embedded; remaining skills used lexical fallback.`;
  } else {
    status = 'fallback';
    fallbackReason =
      failureReasons[0] ||
      'Embedding provider returned no usable vectors; fell back to lexical taxonomy matching.';
  }

  const sampleVector = vectors.values().next().value as number[] | undefined;
  const dims = sampleVector ? sampleVector.length : 0;

  if (status === 'succeeded') {
    console.log(
      `[embeddings] model=${EMBEDDING_MODEL} status=succeeded embedded=${embeddedCount}/${requestedCount} dims=${dims} latency=${latencyMs}ms`
    );
  } else {
    console.warn(
      `[embeddings] model=${EMBEDDING_MODEL} status=${status} embedded=${embeddedCount}/${requestedCount} latency=${latencyMs}ms reason=${fallbackReason}`
    );
  }

  return {
    vectors,
    model: EMBEDDING_MODEL,
    status,
    requestedCount,
    embeddedCount,
    fallbackReason,
    latencyMs,
  };
}

const LEARNING_PLAN_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      day: { type: Type.INTEGER },
      skill: { type: Type.STRING },
      priority: { type: Type.STRING, description: 'High, Medium, or Foundational' },
      objective: { type: Type.STRING },
      activities: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      exercise: { type: Type.STRING },
      expectedOutcome: { type: Type.STRING },
      estimatedHours: { type: Type.NUMBER },
    },
    required: [
      'day',
      'skill',
      'priority',
      'objective',
      'activities',
      'exercise',
      'expectedOutcome',
      'estimatedHours',
    ],
  },
};

function sanitizeLearningPlan(parsed: LearningDayPlan[]): LearningDayPlan[] {
  return parsed.slice(0, 14).map((item, idx) => ({
    day: idx + 1,
    skill: String(item.skill || 'Core Role Readiness').trim(),
    priority:
      item.priority === 'High' || item.priority === 'Medium' || item.priority === 'Foundational'
        ? item.priority
        : 'Medium',
    objective: String(item.objective || '').trim(),
    activities: Array.isArray(item.activities)
      ? item.activities.map((a) => String(a).trim()).filter(Boolean)
      : [],
    exercise: String(item.exercise || '').trim(),
    expectedOutcome: String(item.expectedOutcome || '').trim(),
    estimatedHours:
      typeof item.estimatedHours === 'number' && item.estimatedHours > 0
        ? Math.round(item.estimatedHours * 10) / 10
        : 2,
  }));
}

/**
 * Generates a personalized 14-day learning roadmap strictly from the candidate's
 * missing & partial skills. Uses fast structured generation by default (completes in ~5-10s
 * with zero hang) and supports deep-thinking refinement (ThinkingLevel.HIGH on gemini-4-hydrogen)
 * when explicitly requested.
 */
export async function generatePersonalizedLearningPlan(params: {
  jobTitle: string;
  companyName: string | null;
  compatibilityScore: number;
  missingSkills: SkillMatchResult[];
  partialSkills: SkillMatchResult[];
  matchedSkills: SkillMatchResult[];
  missingQualifications: string[];
  deepThinking?: boolean;
}): Promise<LearningDayPlan[]> {
  const ai = getAiClient();

  const missingSummary = params.missingSkills.slice(0, 14).map((s) => ({
    skill: s.jdSkill,
    category: s.category,
    importance: s.importance,
    jdEvidence: s.jdEvidence.slice(0, 160),
  }));

  const partialSummary = params.partialSkills.slice(0, 8).map((s) => ({
    skill: s.jdSkill,
    closestResumeSkill: s.matchedResumeSkill,
    similarity: s.similarityScore,
    importance: s.importance,
  }));

  const matchedNames = params.matchedSkills.slice(0, 12).map((s) => s.jdSkill);

  const prompt =
    `Design a personalized, practical 14-day upskilling roadmap for a candidate targeting "${params.jobTitle}"` +
    (params.companyName ? ` at ${params.companyName}` : '') +
    `.\n\n` +
    `Compatibility Score: ${params.compatibilityScore}%\n` +
    `Existing Matched Skills: ${matchedNames.join(', ') || 'None detected'}\n` +
    `Missing Skills (with JD evidence):\n${JSON.stringify(missingSummary)}\n` +
    `Partially Matched Skills:\n${JSON.stringify(partialSummary)}\n` +
    `Missing Qualifications/Certifications: ${params.missingQualifications.join(', ') || 'None'}\n\n` +
    `Rules:\n` +
    `- Generate EXACTLY 14 sequential days (day 1 through day 14).\n` +
    `- Days 1-9: focus on high-impact MISSING required skills. Days 10-12: bridge PARTIAL skills. Days 13-14: integrated mini-project & interview readiness.\n` +
    `- If few/no missing skills exist, deepen partial skills and role-specific architecture/production scenarios from the JD.\n` +
    `- Keep each day crisp, concrete, and tailored to the actual missing skills: 1-sentence objective, 2-3 specific activities, 1 hands-on practical exercise, 1 measurable expectedOutcome, and estimatedHours (1.5-3.5).`;

  const systemInstruction =
    'You are a senior technical career coach and curriculum architect. Return a concise, concrete, day-by-day 14-day learning roadmap grounded strictly in the candidate skill gap analysis.';

  // If deepThinking is requested, run gemini-4-hydrogen with ThinkingLevel.HIGH (no maxOutputTokens)
  if (params.deepThinking) {
    const response = await withRetry(
      () =>
        ai.models.generateContent({
          model: DEEP_MODEL,
          contents: prompt,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
            responseMimeType: 'application/json',
            responseSchema: LEARNING_PLAN_SCHEMA,
          },
        }),
      65000,
      'Deep-thinking 14-day roadmap refinement',
      1
    );
    const parsed = safeJsonParse<LearningDayPlan[]>(
      response.text,
      'Failed to parse refined 14-day learning roadmap.'
    );
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Gemini returned an empty learning roadmap.');
    }
    return sanitizeLearningPlan(parsed);
  }

  // Primary analysis path: fast, reliable generation with gemini-3.1-flash-lite (~4-8s)
  // with fallback to gemini-4-hydrogen (ThinkingLevel.LOW) if needed
  try {
    const response = await withRetry(
      () =>
        ai.models.generateContent({
          model: FAST_MODEL,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: LEARNING_PLAN_SCHEMA,
          },
        }),
      25000,
      '14-day learning roadmap generation',
      1
    );
    const parsed = safeJsonParse<LearningDayPlan[]>(
      response.text,
      'Failed to parse personalized 14-day learning roadmap.'
    );
    if (Array.isArray(parsed) && parsed.length > 0) {
      return sanitizeLearningPlan(parsed);
    }
  } catch (fastErr) {
    console.warn(
      'Fast roadmap generation failed; falling back to gemini-4-hydrogen (LOW):',
      fastErr instanceof Error ? fastErr.message : fastErr
    );
  }

  const fallbackResponse = await withRetry(
    () =>
      ai.models.generateContent({
        model: DEEP_MODEL,
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: LEARNING_PLAN_SCHEMA,
        },
      }),
    35000,
    '14-day learning roadmap generation (fallback)',
    1
  );

  const fallbackParsed = safeJsonParse<LearningDayPlan[]>(
    fallbackResponse.text,
    'Failed to parse personalized 14-day learning roadmap.'
  );

  if (!Array.isArray(fallbackParsed) || fallbackParsed.length === 0) {
    throw new Error('Gemini returned an empty learning roadmap.');
  }

  return sanitizeLearningPlan(fallbackParsed);
}

/**
 * Low-latency gap coach powered by gemini-3.1-flash-lite for quick follow-up
 * questions about any specific missing/partial skill in the active report.
 */
export async function answerGapCoachingQuestion(params: {
  question: string;
  report: Pick<
    AnalysisReport,
    'jobTitle' | 'compatibilityScore' | 'matchedSkills' | 'partialSkills' | 'missingSkills'
  >;
}): Promise<{ answer: string; latencyMs: number }> {
  const ai = getAiClient();
  const start = Date.now();

  const context = {
    jobTitle: params.report.jobTitle,
    compatibilityScore: params.report.compatibilityScore,
    matched: params.report.matchedSkills.slice(0, 12).map((s) => s.jdSkill),
    partial: params.report.partialSkills.slice(0, 8).map((s) => ({
      required: s.jdSkill,
      resumeHas: s.matchedResumeSkill,
      evidence: s.jdEvidence,
    })),
    missing: params.report.missingSkills.slice(0, 12).map((s) => ({
      skill: s.jdSkill,
      importance: s.importance,
      evidence: s.jdEvidence,
    })),
  };

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: FAST_MODEL,
        contents:
          `Based ONLY on this Resume-vs-JD gap analysis report:\n${JSON.stringify(context, null, 2)}\n\n` +
          `Candidate Question: ${params.question}\n\n` +
          `Provide a crisp, practical, truthful answer in 3-5 concise bullet points or short paragraphs. Never advise fabricating experience.`,
        config: {
          systemInstruction:
            'You are a concise, honest technical hiring coach. Give actionable advice grounded strictly in the analysis data without inventing qualifications.',
        },
      }),
    20000,
    'Gap advisor response'
  );

  return {
    answer: (response.text || 'Unable to generate guidance right now.').trim(),
    latencyMs: Date.now() - start,
  };
}
