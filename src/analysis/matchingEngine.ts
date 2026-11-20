import type { ExtractedSkillItem, SkillMatchResult } from '../types/analysis.ts';
import { findVerifiedJdEvidence } from './evidenceEngine.ts';
import { normalizeSkillName } from './skillTaxonomy.ts';

export const SEMANTIC_MATCH_THRESHOLD = 0.78;
export const PARTIAL_MATCH_THRESHOLD = 0.62;

/**
 * Pure vector cosine similarity (returns 0..1 clamped for positive semantic similarity).
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA.length || vecA.length !== vecB.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  const raw = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1, raw));
}

/**
 * Concept clusters for deterministic lexical-semantic fallback when neural
 * embeddings are unavailable or during pure offline unit testing.
 */
const RELATED_SKILL_CLUSTERS: string[][] = [
  ['rest api', 'restful web services', 'http api', 'api development', 'backend api', 'graphql', 'web services'],
  ['postgresql', 'mysql', 'sql', 'relational database', 'mariadb', 'sql server', 'oracle database'],
  ['aws', 'google cloud platform', 'microsoft azure', 'cloud computing', 'cloud infrastructure'],
  ['docker', 'kubernetes', 'containerization', 'containers', 'helm', 'devops'],
  ['ci/cd', 'github actions', 'jenkins', 'gitlab ci/cd', 'automated deployment', 'build pipelines'],
  ['react', 'next.js', 'vue.js', 'angular', 'frontend development', 'spa'],
  ['node.js', 'express.js', 'nestjs', 'backend development', 'javascript'],
  ['python', 'fastapi', 'django', 'flask', 'sqlalchemy'],
  ['machine learning', 'deep learning', 'scikit-learn', 'pytorch', 'tensorflow', 'data science'],
  ['natural language processing', 'large language models', 'generative ai', 'spacy', 'rag', 'transformers'],
  ['unit testing', 'jest', 'vitest', 'pytest', 'playwright', 'cypress', 'test automation'],
  ['agile methodology', 'scrum', 'kanban', 'sprint planning'],
  ['system design', 'distributed systems', 'microservices', 'scalable architecture'],
  ['data visualization', 'recharts', 'tableau', 'power bi', 'd3.js', 'analytics'],
];

function tokenizeSkill(text: string): Set<string> {
  const stopWords = new Set(['and', 'or', 'of', 'the', 'in', 'for', 'with', 'development', 'engineering', 'services', 'systems']);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !stopWords.has(t))
  );
}

function charBigrams(text: string): Set<string> {
  const clean = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 1; i++) {
    set.add(clean.slice(i, i + 2));
  }
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deterministic lexical & domain-cluster semantic similarity (0..1).
 */
export function lexicalSemanticSimilarity(skillA: string, skillB: string): number {
  const normA = normalizeSkillName(skillA).toLowerCase();
  const normB = normalizeSkillName(skillB).toLowerCase();
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  // Substring containment for compound skills (e.g., "REST API" inside "REST API Development")
  if (
    (normA.length >= 4 && normB.includes(normA)) ||
    (normB.length >= 4 && normA.includes(normB))
  ) {
    return 0.84;
  }

  const tokenSim = jaccard(tokenizeSkill(normA), tokenizeSkill(normB));
  const bigramSim = jaccard(charBigrams(normA), charBigrams(normB));
  let score = Math.max(tokenSim * 0.9, bigramSim * 0.78);

  // Domain cluster boost (partial relatedness, e.g., MySQL <-> PostgreSQL, Docker <-> Kubernetes)
  for (const cluster of RELATED_SKILL_CLUSTERS) {
    const aIn = cluster.some((c) => normA.includes(c) || c.includes(normA));
    const bIn = cluster.some((c) => normB.includes(c) || c.includes(normB));
    if (aIn && bIn) {
      score = Math.max(score, 0.7);
      break;
    }
  }

  return Math.round(score * 1000) / 1000;
}

export interface MatchSkillsOptions {
  jdText: string;
  resumeSkills: ExtractedSkillItem[];
  jdSkills: ExtractedSkillItem[];
  embeddingsBySkill?: Map<string, number[]>;
}

export interface MatchSkillsOutput {
  matched: SkillMatchResult[];
  partial: SkillMatchResult[];
  missing: SkillMatchResult[];
  usedEmbeddings: boolean;
}

/**
 * Compares normalized JD skills against normalized Resume skills using:
 * 1) Exact canonical taxonomy match
 * 2) Cosine similarity on neural embeddings (when provided)
 * 3) Lexical + domain-cluster fallback similarity
 * And attaches verbatim verified JD evidence to every requirement.
 */
export function matchSkillsAgainstJd(options: MatchSkillsOptions): MatchSkillsOutput {
  const { jdText, resumeSkills, jdSkills, embeddingsBySkill } = options;
  const matched: SkillMatchResult[] = [];
  const partial: SkillMatchResult[] = [];
  const missing: SkillMatchResult[] = [];

  const resumeByCanonical = new Map<string, ExtractedSkillItem>();
  for (const rs of resumeSkills) {
    resumeByCanonical.set(rs.canonicalName.toLowerCase(), rs);
  }

  let usedEmbeddings = false;

  for (const jdItem of jdSkills) {
    const jdKey = jdItem.canonicalName.toLowerCase();
    const evidence = findVerifiedJdEvidence(
      jdText,
      jdItem.canonicalName,
      jdItem.rawName,
      jdItem.evidenceQuote
    );

    // 1. Exact canonical taxonomy match
    const exactResume = resumeByCanonical.get(jdKey);
    if (exactResume) {
      matched.push({
        jdSkill: jdItem.canonicalName,
        rawJdSkill: jdItem.rawName,
        category: jdItem.category,
        importance: jdItem.importance ?? 'required',
        status: 'matched',
        matchMethod: 'exact_normalized',
        similarityScore: 1,
        matchedResumeSkill: exactResume.canonicalName,
        jdEvidence: evidence.snippet,
        evidenceVerified: evidence.verified,
      });
      continue;
    }

    // 2. Semantic similarity comparison against all resume skills
    let bestScore = 0;
    let bestResumeSkill: string | null = null;
    let bestMethod: 'semantic_embedding' | 'semantic_lexical' | 'none' = 'none';

    const jdVec = embeddingsBySkill?.get(jdKey);

    for (const rs of resumeSkills) {
      const rsKey = rs.canonicalName.toLowerCase();
      const rsVec = embeddingsBySkill?.get(rsKey);

      let score = 0;
      let method: 'semantic_embedding' | 'semantic_lexical' = 'semantic_lexical';

      if (jdVec && rsVec) {
        usedEmbeddings = true;
        const vecSim = cosineSimilarity(jdVec, rsVec);
        const lexSim = lexicalSemanticSimilarity(jdItem.canonicalName, rs.canonicalName);
        // Combine neural embedding with high-confidence lexical match without inflating noise
        score = Math.max(vecSim, lexSim >= 0.8 ? lexSim : vecSim);
        method = 'semantic_embedding';
      } else {
        score = lexicalSemanticSimilarity(jdItem.canonicalName, rs.canonicalName);
        method = 'semantic_lexical';
      }

      if (score > bestScore) {
        bestScore = score;
        bestResumeSkill = rs.canonicalName;
        bestMethod = method;
      }
    }

    const roundedScore = Math.round(bestScore * 100) / 100;

    if (roundedScore >= SEMANTIC_MATCH_THRESHOLD && bestResumeSkill) {
      matched.push({
        jdSkill: jdItem.canonicalName,
        rawJdSkill: jdItem.rawName,
        category: jdItem.category,
        importance: jdItem.importance ?? 'required',
        status: 'matched',
        matchMethod: bestMethod,
        similarityScore: roundedScore,
        matchedResumeSkill: bestResumeSkill,
        jdEvidence: evidence.snippet,
        evidenceVerified: evidence.verified,
      });
    } else if (roundedScore >= PARTIAL_MATCH_THRESHOLD && bestResumeSkill) {
      partial.push({
        jdSkill: jdItem.canonicalName,
        rawJdSkill: jdItem.rawName,
        category: jdItem.category,
        importance: jdItem.importance ?? 'required',
        status: 'partial',
        matchMethod: bestMethod,
        similarityScore: roundedScore,
        matchedResumeSkill: bestResumeSkill,
        jdEvidence: evidence.snippet,
        evidenceVerified: evidence.verified,
      });
    } else {
      missing.push({
        jdSkill: jdItem.canonicalName,
        rawJdSkill: jdItem.rawName,
        category: jdItem.category,
        importance: jdItem.importance ?? 'required',
        status: 'missing',
        matchMethod: 'none',
        similarityScore: roundedScore,
        matchedResumeSkill: bestScore >= 0.45 ? bestResumeSkill : null,
        jdEvidence: evidence.snippet,
        evidenceVerified: evidence.verified,
      });
    }
  }

  // Sort missing & partial by required first, then descending similarity
  const importanceRank = (imp: string) => (imp === 'required' ? 0 : 1);
  matched.sort((a, b) => b.similarityScore - a.similarityScore);
  partial.sort((a, b) => importanceRank(a.importance) - importanceRank(b.importance) || b.similarityScore - a.similarityScore);
  missing.sort((a, b) => importanceRank(a.importance) - importanceRank(b.importance) || a.jdSkill.localeCompare(b.jdSkill));

  return { matched, partial, missing, usedEmbeddings };
}
