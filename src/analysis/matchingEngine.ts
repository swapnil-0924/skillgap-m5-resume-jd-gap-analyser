import type { ExtractedSkillItem, SkillCategory, SkillMatchResult } from '../types/analysis.ts';
import { findVerifiedJdEvidence } from './evidenceEngine.ts';
import { normalizeSkillName } from './skillTaxonomy.ts';

/**
 * Thresholds for semantic / transferable partial classification.
 * Confirmed `matched` status is reserved strictly for exact canonical taxonomy
 * or verified synonym matches — never semantic similarity alone.
 */
export const EMBEDDING_PARTIAL_THRESHOLD = 0.72;
export const LEXICAL_PARTIAL_THRESHOLD = 0.62;
export const SEMANTIC_REVIEW_THRESHOLD = 0.78;
/** @deprecated Retained for backwards compatibility; semantic similarity never auto-confirms `matched`. */
export const SEMANTIC_MATCH_THRESHOLD = SEMANTIC_REVIEW_THRESHOLD;
export const PARTIAL_MATCH_THRESHOLD = LEXICAL_PARTIAL_THRESHOLD;

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

function makePairKey(a: string, b: string): string {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

/**
 * Distinct technologies that frequently collide lexically (shared prefixes/tokens)
 * or cluster closely in vector space despite representing different platforms,
 * runtimes, or specializations. These pairs must NEVER be treated as equivalent
 * or transferable matches.
 */
const NON_SUBSTITUTABLE_PAIRS = new Set<string>([
  makePairKey('java', 'javascript'),
  makePairKey('react', 'react native'),
  makePairKey('c', 'c#'),
  makePairKey('c++', 'c#'),
  makePairKey('python', 'pytorch'),
  makePairKey('python', 'tensorflow'),
  makePairKey('javascript', 'react native'),
  makePairKey('go', 'google cloud platform'),
]);

/**
 * Closely related programming language dialects/families where partial
 * transferability is defensible (never exact `matched`).
 */
const TRANSFERABLE_LANGUAGE_PAIRS = new Set<string>([
  makePairKey('typescript', 'javascript'),
  makePairKey('c', 'c++'),
  makePairKey('kotlin', 'java'),
  makePairKey('sass', 'css'),
]);

/**
 * Explicit concept clusters for deterministic transferable/partial relatedness
 * (exact normalized member lookup only — NEVER substring matching).
 */
const RELATED_SKILL_CLUSTERS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['rest api', 'http api', 'api development', 'api design', 'backend api', 'graphql', 'web services']),
  new Set(['postgresql', 'mysql', 'sql', 'relational database', 'mariadb', 'sqlite', 'sql server', 'oracle database']),
  new Set(['aws', 'google cloud platform', 'microsoft azure', 'cloud computing', 'cloud infrastructure']),
  new Set(['docker', 'kubernetes', 'containers', 'helm', 'devops']),
  new Set(['ci/cd', 'github actions', 'jenkins', 'gitlab ci/cd', 'automated deployment', 'build pipelines']),
  new Set(['react', 'next.js', 'vue.js', 'nuxt.js', 'angular', 'svelte', 'sveltekit', 'frontend development', 'spa']),
  new Set(['react native', 'flutter', 'ios', 'android', 'mobile development']),
  new Set(['node.js', 'express.js', 'nestjs', 'backend development']),
  new Set(['fastapi', 'django', 'django rest framework', 'flask', 'sqlalchemy']),
  new Set(['machine learning', 'deep learning', 'scikit-learn', 'pytorch', 'tensorflow', 'keras', 'data science']),
  new Set(['natural language processing', 'large language models', 'generative ai', 'spacy', 'rag', 'transformers']),
  new Set(['unit testing', 'jest', 'vitest', 'pytest', 'playwright', 'cypress', 'selenium', 'test automation']),
  new Set(['agile methodology', 'scrum', 'kanban', 'sprint planning']),
  new Set(['system design', 'distributed systems', 'microservices', 'scalable architecture']),
  new Set(['data visualization', 'recharts', 'tableau', 'power bi', 'd3.js', 'analytics']),
];

const SPECIALIZED_TECH_CATEGORIES = new Set<SkillCategory>([
  'framework',
  'library',
  'cloud',
  'dev_tool',
]);

const DATABASE_RELATED_SKILLS = new Set([
  'sql',
  'postgresql',
  'mysql',
  'mariadb',
  'sqlite',
  'sql server',
  'oracle database',
  'relational database',
]);

export function isNonSubstitutableSkillPair(skillA: string, skillB: string): boolean {
  const normA = normalizeSkillName(skillA).toLowerCase();
  const normB = normalizeSkillName(skillB).toLowerCase();
  if (!normA || !normB || normA === normB) return false;
  return NON_SUBSTITUTABLE_PAIRS.has(makePairKey(normA, normB));
}

function areInSameRelatedCluster(normA: string, normB: string): boolean {
  for (const cluster of RELATED_SKILL_CLUSTERS) {
    if (cluster.has(normA) && cluster.has(normB)) {
      return true;
    }
  }
  return false;
}

function isBlockedByCategoryGuard(
  jdSkill: ExtractedSkillItem,
  resumeSkill: ExtractedSkillItem,
  normJd: string,
  normRs: string
): boolean {
  if (NON_SUBSTITUTABLE_PAIRS.has(makePairKey(normJd, normRs))) {
    return true;
  }

  // Distinct canonical programming languages are not interchangeable unless in an explicit dialect family
  if (
    jdSkill.category === 'programming_language' &&
    resumeSkill.category === 'programming_language' &&
    normJd !== normRs &&
    !TRANSFERABLE_LANGUAGE_PAIRS.has(makePairKey(normJd, normRs))
  ) {
    return true;
  }

  // Knowing a base programming language alone does not verify specialized frameworks/libraries/cloud tools,
  // and conversely a generic dev tool/framework/library does not prove proficiency in an unrelated programming language
  // (Exception: SQL <-> relational databases such as PostgreSQL/MySQL).
  const isSqlDatabasePair =
    DATABASE_RELATED_SKILLS.has(normJd) && DATABASE_RELATED_SKILLS.has(normRs);
  if (
    !isSqlDatabasePair &&
    ((resumeSkill.category === 'programming_language' &&
      SPECIALIZED_TECH_CATEGORIES.has(jdSkill.category)) ||
      (jdSkill.category === 'programming_language' &&
        SPECIALIZED_TECH_CATEGORIES.has(resumeSkill.category)))
  ) {
    return true;
  }

  // Soft skills should not semantically match hard technical categories
  if (
    (jdSkill.category === 'soft_skill' && resumeSkill.category !== 'soft_skill') ||
    (resumeSkill.category === 'soft_skill' && jdSkill.category !== 'soft_skill')
  ) {
    return true;
  }

  return false;
}

function tokenizeSkill(text: string): Set<string> {
  const stopWords = new Set([
    'and',
    'or',
    'of',
    'the',
    'in',
    'for',
    'with',
    'development',
    'engineering',
    'services',
    'systems',
  ]);
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
 * NEVER uses raw substring containment as a synonym signal.
 * Non-identical skills are strictly capped below 1.0 (max 0.72) so lexical
 * heuristics can only suggest partial/transferable matches, never exact matches.
 */
export function lexicalSemanticSimilarity(skillA: string, skillB: string): number {
  const normA = normalizeSkillName(skillA).toLowerCase();
  const normB = normalizeSkillName(skillB).toLowerCase();
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  if (NON_SUBSTITUTABLE_PAIRS.has(makePairKey(normA, normB))) {
    return 0.15;
  }

  if (TRANSFERABLE_LANGUAGE_PAIRS.has(makePairKey(normA, normB))) {
    return 0.7;
  }

  const tokensA = tokenizeSkill(normA);
  const tokensB = tokenizeSkill(normB);
  const tokenSim = jaccard(tokensA, tokensB);
  const bigramSim = jaccard(charBigrams(normA), charBigrams(normB));

  // Conservative lexical score — single-token shared words (like "React" in "React Native")
  // stay below partial threshold without an explicit taxonomy/cluster relationship.
  let score = Math.max(tokenSim * 0.75, bigramSim * 0.55);

  // Explicit transferable domain cluster (exact canonical membership only, never substring)
  if (areInSameRelatedCluster(normA, normB)) {
    score = Math.max(score, 0.7);
  }

  // Non-identical skills never exceed 0.72 in lexical mode
  return Math.round(Math.min(0.72, score) * 1000) / 1000;
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
  embeddingComparisonCount: number;
  lexicalFallbackCount: number;
}

/**
 * Compares normalized JD skills against normalized Resume skills using:
 * 1) Exact canonical taxonomy / verified synonym match -> `matched`
 * 2) Semantic similarity (neural embeddings when available, else lexical/cluster fallback)
 *    with non-substitutable & category guards -> at most `partial` (`reviewRequired: true`)
 *    — semantic similarity alone NEVER establishes a confirmed `matched` skill.
 * 3) Verbatim verified JD evidence attached to every requirement.
 */
export function matchSkillsAgainstJd(options: MatchSkillsOptions): MatchSkillsOutput {
  const { jdText, resumeSkills, jdSkills, embeddingsBySkill } = options;
  const matched: SkillMatchResult[] = [];
  const partial: SkillMatchResult[] = [];
  const missing: SkillMatchResult[] = [];

  const resumeByCanonical = new Map<string, ExtractedSkillItem>();
  for (const rs of resumeSkills) {
    const canonical = normalizeSkillName(rs.canonicalName || rs.rawName);
    if (!canonical) continue;
    resumeByCanonical.set(canonical.toLowerCase(), {
      ...rs,
      canonicalName: canonical,
    });
  }

  let usedEmbeddings = false;
  let embeddingComparisonCount = 0;
  let lexicalFallbackCount = 0;

  for (const jdItem of jdSkills) {
    const jdCanonical = normalizeSkillName(jdItem.canonicalName || jdItem.rawName);
    const jdKey = jdCanonical.toLowerCase();
    const normalizedJdItem: ExtractedSkillItem = {
      ...jdItem,
      canonicalName: jdCanonical,
    };

    const evidence = findVerifiedJdEvidence(
      jdText,
      jdCanonical,
      jdItem.rawName,
      jdItem.evidenceQuote
    );

    // 1. Exact canonical taxonomy / verified synonym match ONLY
    const exactResume = resumeByCanonical.get(jdKey);
    if (exactResume) {
      const isAliasMatch =
        exactResume.rawName.trim().toLowerCase() !== jdItem.rawName.trim().toLowerCase();
      matched.push({
        jdSkill: jdCanonical,
        rawJdSkill: jdItem.rawName,
        category: jdItem.category,
        importance: jdItem.importance ?? 'required',
        status: 'matched',
        matchMethod: 'exact_normalized',
        similarityScore: 1,
        matchedResumeSkill: exactResume.canonicalName,
        jdEvidence: evidence.snippet,
        evidenceVerified: evidence.verified,
        reviewRequired: false,
        matchReason: isAliasMatch
          ? `Exact taxonomy synonym match (${exactResume.rawName} = ${jdCanonical})`
          : 'Exact canonical skill match',
      });
      continue;
    }

    // 2. Semantic similarity comparison against all resume skills (never auto-confirms `matched`)
    let bestScore = 0;
    let bestResumeSkill: string | null = null;
    let bestMethod: 'semantic_embedding' | 'semantic_lexical' | 'none' = 'none';
    let bestThreshold = LEXICAL_PARTIAL_THRESHOLD;

    const jdVec = embeddingsBySkill?.get(jdKey);

    for (const rs of resumeByCanonical.values()) {
      const rsKey = rs.canonicalName.toLowerCase();

      if (isBlockedByCategoryGuard(normalizedJdItem, rs, jdKey, rsKey)) {
        continue;
      }

      const rsVec = embeddingsBySkill?.get(rsKey);
      let score = 0;
      let method: 'semantic_embedding' | 'semantic_lexical' = 'semantic_lexical';
      let threshold = LEXICAL_PARTIAL_THRESHOLD;

      if (jdVec && rsVec) {
        usedEmbeddings = true;
        embeddingComparisonCount += 1;
        // Pure neural cosine similarity — never inflated by lexical heuristics
        score = cosineSimilarity(jdVec, rsVec);
        method = 'semantic_embedding';
        threshold = EMBEDDING_PARTIAL_THRESHOLD;
      } else {
        lexicalFallbackCount += 1;
        score = lexicalSemanticSimilarity(jdCanonical, rs.canonicalName);
        method = 'semantic_lexical';
        threshold = LEXICAL_PARTIAL_THRESHOLD;
      }

      if (score > bestScore) {
        bestScore = score;
        bestResumeSkill = rs.canonicalName;
        bestMethod = method;
        bestThreshold = threshold;
      }
    }

    const roundedScore = Math.round(bestScore * 100) / 100;

    if (roundedScore >= bestThreshold && bestResumeSkill) {
      const highConfidenceAmbiguous = roundedScore >= SEMANTIC_REVIEW_THRESHOLD;
      const reason =
        bestMethod === 'semantic_embedding'
          ? highConfidenceAmbiguous
            ? `High semantic similarity to ${bestResumeSkill} via Gemini embeddings — manual review recommended (not an exact canonical match)`
            : `Transferable/related skill (${bestResumeSkill}) via Gemini embeddings — verify hands-on depth`
          : `Transferable/related skill (${bestResumeSkill}) via lexical taxonomy cluster — manual review recommended`;

      partial.push({
        jdSkill: jdCanonical,
        rawJdSkill: jdItem.rawName,
        category: jdItem.category,
        importance: jdItem.importance ?? 'required',
        status: 'partial',
        matchMethod: bestMethod,
        similarityScore: roundedScore,
        matchedResumeSkill: bestResumeSkill,
        jdEvidence: evidence.snippet,
        evidenceVerified: evidence.verified,
        reviewRequired: true,
        matchReason: reason,
      });
    } else {
      missing.push({
        jdSkill: jdCanonical,
        rawJdSkill: jdItem.rawName,
        category: jdItem.category,
        importance: jdItem.importance ?? 'required',
        status: 'missing',
        matchMethod: 'none',
        similarityScore: roundedScore,
        matchedResumeSkill: null,
        jdEvidence: evidence.snippet,
        evidenceVerified: evidence.verified,
        reviewRequired: false,
        matchReason: 'No exact or transferable match found in resume',
      });
    }
  }

  // Sort missing & partial by required first, then descending similarity
  const importanceRank = (imp: string) => (imp === 'required' ? 0 : 1);
  matched.sort((a, b) => b.similarityScore - a.similarityScore);
  partial.sort(
    (a, b) =>
      importanceRank(a.importance) - importanceRank(b.importance) ||
      b.similarityScore - a.similarityScore
  );
  missing.sort(
    (a, b) =>
      importanceRank(a.importance) - importanceRank(b.importance) ||
      a.jdSkill.localeCompare(b.jdSkill)
  );

  return {
    matched,
    partial,
    missing,
    usedEmbeddings,
    embeddingComparisonCount,
    lexicalFallbackCount,
  };
}
