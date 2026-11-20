import type { AnalysisReport } from '../types/analysis.ts';
import { matchSkillsAgainstJd } from '../analysis/matchingEngine.ts';
import { calculateCompatibilityScore } from '../analysis/scoringEngine.ts';
import {
  embedSkillNames,
  extractPdfTextViaGeminiOcr,
  extractStructuredJobDescription,
  extractStructuredResume,
  generatePersonalizedLearningPlan,
} from './geminiService.ts';
import {
  DocumentValidationError,
  extractPdfDocument,
  sanitizeFilename,
} from './pdfProcessor.ts';

export interface RunAnalysisPipelineParams {
  resumeFile: {
    buffer: Buffer;
    originalname: string;
    mimetype?: string;
  };
  jdText?: string;
  jdFile?: {
    buffer: Buffer;
    originalname: string;
    mimetype?: string;
  };
  onProgress?: (stepIndex: number, message: string) => void;
}

export async function runFullGapAnalysisPipeline(
  params: RunAnalysisPipelineParams
): Promise<Omit<AnalysisReport, 'id' | 'saved' | 'createdAt'>> {
  const startTime = Date.now();
  const safeResumeFilename = sanitizeFilename(params.resumeFile.originalname);
  const reportProgress = (stepIndex: number, message: string) => {
    params.onProgress?.(stepIndex, message);
  };

  // Stage 0: Extract Resume PDF text (with automatic Gemini OCR fallback for scanned/mixed PDFs)
  reportProgress(0, 'Validating PDF integrity & extracting text / OCR');
  const tPdf = Date.now();
  const resumeDoc = await extractPdfDocument(
    params.resumeFile.buffer,
    safeResumeFilename,
    params.resumeFile.mimetype,
    extractPdfTextViaGeminiOcr
  );

  // Extract / Validate Job Description (either pasted text or uploaded JD PDF)
  let jdText = '';
  let jdSourceName = 'Pasted Job Description';
  let jdInputType: 'text' | 'pdf' = 'text';
  let jdPageCount: number | null = null;
  let jdExtractionMethod: 'direct_text' | 'pdf_text' | 'gemini_ocr' | 'hybrid_ocr' = 'direct_text';

  if (params.jdFile && params.jdFile.buffer.length > 0) {
    jdSourceName = sanitizeFilename(params.jdFile.originalname);
    jdInputType = 'pdf';
    const jdDoc = await extractPdfDocument(
      params.jdFile.buffer,
      jdSourceName,
      params.jdFile.mimetype,
      extractPdfTextViaGeminiOcr
    );
    jdText = jdDoc.text;
    jdPageCount = jdDoc.pageCount;
    jdExtractionMethod = jdDoc.extractionMethod;
  } else {
    jdText = (params.jdText || '').trim();
  }

  const jdWordCount = jdText.split(/\s+/).filter(Boolean).length;
  if (jdText.length < 40 || jdWordCount < 8) {
    throw new DocumentValidationError(
      'Job Description content is too short to analyze. Please provide a complete Job Description (at least 40 characters / 8 words) or upload a JD PDF.',
      400
    );
  }
  console.log(`[pipeline] Stage 0 (PDF/JD extract): ${Date.now() - tPdf}ms`);

  // Stage 1: Parallel Gemini Structured Extraction for Resume & JD
  reportProgress(1, 'Extracting structured skills, qualifications & experience');
  const tExtract = Date.now();
  const [resumeStructured, jdStructured] = await Promise.all([
    extractStructuredResume(resumeDoc.text),
    extractStructuredJobDescription(jdText),
  ]);
  console.log(
    `[pipeline] Stage 1 (Structured extraction): ${Date.now() - tExtract}ms (resume=${resumeStructured.skills.length}, jd=${jdStructured.skills.length})`
  );

  if (jdStructured.skills.length === 0 && jdStructured.qualifications.length === 0) {
    throw new DocumentValidationError(
      'No identifiable job requirements or skills were found in the provided Job Description. Please provide a more detailed Job Description.',
      422
    );
  }

  // Stage 2: Semantic Embedding Generation via gemini-embedding-2
  reportProgress(2, 'Normalizing taxonomy & computing semantic skill embeddings');
  const tEmbed = Date.now();
  const allUniqueCanonicalSkills = Array.from(
    new Set([
      ...resumeStructured.skills.map((s) => s.canonicalName),
      ...jdStructured.skills.map((s) => s.canonicalName),
    ])
  );
  const embeddingResult = await embedSkillNames(allUniqueCanonicalSkills);
  console.log(
    `[pipeline] Stage 2 (Embeddings): ${Date.now() - tEmbed}ms (status=${embeddingResult.status}, vectors=${embeddingResult.embeddedCount}/${embeddingResult.requestedCount}${embeddingResult.fallbackReason ? `, reason=${embeddingResult.fallbackReason}` : ''})`
  );

  // Stage 3: Semantic & Exact Skill Matching + Verbatim JD Evidence Verification + Deterministic Score
  reportProgress(3, 'Verifying JD evidence & calculating weighted compatibility score');
  const tMatch = Date.now();
  const matchOutput = matchSkillsAgainstJd({
    jdText,
    resumeSkills: resumeStructured.skills,
    jdSkills: jdStructured.skills,
    embeddingsBySkill: embeddingResult.vectors,
  });

  const allMatches = [
    ...matchOutput.matched,
    ...matchOutput.partial,
    ...matchOutput.missing,
  ];

  const { scoreBreakdown, experienceAlignment } = calculateCompatibilityScore({
    allSkillMatches: allMatches,
    resumeExperience: resumeStructured.experience,
    jdExperience: jdStructured.experience,
    resumeQualifications: resumeStructured.qualifications,
    jdQualifications: jdStructured.qualifications,
    resumeCertifications: resumeStructured.certifications,
    jdCertifications: jdStructured.certifications,
    resumeJobTitle: resumeStructured.jobTitle,
    jdJobTitle: jdStructured.jobTitle,
  });

  const resolvedJobTitle = jdStructured.jobTitle || 'Target Role';
  const resolvedCompanyName = jdStructured.companyName || null;
  const semanticMatchingEngine: 'gemini_embedding_2' | 'lexical_fallback' =
    embeddingResult.status === 'succeeded' ||
    (embeddingResult.status === 'partial' && matchOutput.usedEmbeddings)
      ? 'gemini_embedding_2'
      : 'lexical_fallback';

  console.log(
    `[pipeline] Stage 3 (Matching & Scoring): ${Date.now() - tMatch}ms (engine=${semanticMatchingEngine}, embedding_comparisons=${matchOutput.embeddingComparisonCount}, lexical_comparisons=${matchOutput.lexicalFallbackCount}, score=${scoreBreakdown.overallScore}%, exp_relevance=${experienceAlignment.relevanceFactor ?? 0})`
  );

  // Stage 4: Personalized 14-Day Learning Plan
  reportProgress(4, 'Generating personalized 14-day learning roadmap');
  const tPlan = Date.now();
  const learningPlan = await generatePersonalizedLearningPlan({
    jobTitle: resolvedJobTitle,
    companyName: resolvedCompanyName,
    compatibilityScore: scoreBreakdown.overallScore,
    missingSkills: matchOutput.missing,
    partialSkills: matchOutput.partial,
    matchedSkills: matchOutput.matched,
    missingQualifications: [
      ...experienceAlignment.missingQualifications,
      ...experienceAlignment.missingCertifications,
    ],
  });
  console.log(`[pipeline] Stage 4 (14-Day Roadmap): ${Date.now() - tPlan}ms`);

  return {
    resumeFilename: safeResumeFilename,
    jobTitle: resolvedJobTitle,
    companyName: resolvedCompanyName,
    jdSourceName,
    jdText,
    resumeTextExcerpt: resumeDoc.text.slice(0, 1200),
    extractionMeta: {
      resumePageCount: resumeDoc.pageCount,
      resumeExtractionMethod: resumeDoc.extractionMethod,
      resumeCharCount: resumeDoc.charCount,
      jdInputType,
      jdPageCount,
      jdExtractionMethod,
      jdCharCount: jdText.length,
      semanticMatchingEngine,
      embeddingDiagnostics: {
        provider: embeddingResult.model,
        status: embeddingResult.status,
        requestedCount: embeddingResult.requestedCount,
        embeddedCount: embeddingResult.embeddedCount,
        fallbackReason: embeddingResult.fallbackReason,
        latencyMs: embeddingResult.latencyMs,
      },
      processingTimeMs: Date.now() - startTime,
    },
    compatibilityScore: scoreBreakdown.overallScore,
    scoreBreakdown,
    matchedSkills: matchOutput.matched,
    partialSkills: matchOutput.partial,
    missingSkills: matchOutput.missing,
    resumeSkills: resumeStructured.skills,
    jdSkills: jdStructured.skills,
    experienceAlignment,
    learningPlan,
    completedDays: [],
  };
}
