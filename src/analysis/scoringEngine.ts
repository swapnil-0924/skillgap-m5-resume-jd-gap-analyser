import type {
  CompatibilityScoreBreakdown,
  ExperienceAlignment,
  ExperienceProfile,
  ExperienceScoreBreakdown,
  ScorePillarBreakdown,
  SkillCategory,
  SkillMatchResult,
} from '../types/analysis.ts';
import { normalizeSkillName } from './skillTaxonomy.ts';

const TECHNICAL_CATEGORIES = new Set<SkillCategory>([
  'programming_language',
  'framework',
  'library',
  'database',
  'cloud',
  'dev_tool',
  'technical_skill',
]);

const SENIORITY_RANK: Record<string, number> = {
  intern: 0,
  entry: 1,
  junior: 1,
  associate: 1.5,
  mid: 2,
  'mid-level': 2,
  intermediate: 2,
  senior: 3,
  staff: 4,
  lead: 4,
  principal: 5,
  director: 5,
  executive: 6,
};

const GENERIC_ROLE_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'years',
  'year',
  'yrs',
  'yr',
  'experience',
  'experienced',
  'senior',
  'junior',
  'mid',
  'level',
  'staff',
  'lead',
  'principal',
  'head',
  'chief',
  'associate',
  'entry',
  'intern',
  'director',
  'manager',
  'specialist',
  'engineer',
  'engineering',
  'developer',
  'development',
  'building',
  'designing',
  'managing',
  'working',
  'strong',
  'proven',
  'scalable',
  'systems',
  'applications',
  'application',
  'operations',
  'software',
  'role',
  'position',
  'seeking',
  'hiring',
  'needed',
  'required',
  'preferred',
]);

function parseSeniorityRank(level: string): number {
  const lower = (level || '').toLowerCase();
  for (const [key, rank] of Object.entries(SENIORITY_RANK)) {
    if (lower.includes(key)) return rank;
  }
  return 2; // neutral default if unspecified
}

function tokenizePhrase(text: string, dropGenericRoleWords = false): Set<string> {
  const baseStop = new Set(['and', 'or', 'of', 'the', 'in', 'for', 'with', 'a', 'an', 'to']);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#\s-]/g, ' ')
      .split(/[\s-]+/)
      .filter((t) => {
        if (t.length < 2) return false;
        if (baseStop.has(t)) return false;
        if (dropGenericRoleWords && GENERIC_ROLE_STOP_WORDS.has(t)) return false;
        return true;
      })
  );
}

function diceTokenSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return (2 * intersection) / (a.size + b.size);
}

function matchStringLists(
  resumeItems: string[],
  jdItems: string[],
  options?: { allowDegreeHierarchy?: boolean }
): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];
  const allowDegreeHierarchy = options?.allowDegreeHierarchy ?? false;

  for (const req of jdItems) {
    const cleanReq = req.trim();
    if (!cleanReq) continue;
    const reqNorm = normalizeSkillName(cleanReq).toLowerCase();
    const reqTokens = tokenizePhrase(cleanReq, false);

    const isMatched = resumeItems.some((res) => {
      const cleanRes = res.trim();
      if (!cleanRes) return false;
      const resNorm = normalizeSkillName(cleanRes).toLowerCase();
      if (reqNorm && reqNorm === resNorm) return true;

      const resTokens = tokenizePhrase(cleanRes, false);
      const tokenDice = diceTokenSimilarity(reqTokens, resTokens);
      if (tokenDice >= 0.6) return true;

      if (allowDegreeHierarchy) {
        // Handle degree hierarchy (Master's/PhD satisfies Bachelor's in same/related field)
        const reqLower = cleanReq.toLowerCase();
        const resLower = cleanRes.toLowerCase();
        const reqIsBachelors =
          reqLower.includes('bachelor') ||
          /\bb\.?s\.?\b/.test(reqLower) ||
          reqLower.includes('b.tech') ||
          reqLower.includes('degree');
        const resHasDegree =
          resLower.includes('bachelor') ||
          resLower.includes('master') ||
          resLower.includes('phd') ||
          resLower.includes('b.tech') ||
          resLower.includes('m.tech') ||
          /\bb\.?s\.?\b/.test(resLower) ||
          /\bm\.?s\.?\b/.test(resLower);

        if (reqIsBachelors && resHasDegree) {
          // Verify field-of-study overlap when both specify a discipline
          const degreeWords = new Set([
            'bachelor',
            'bachelors',
            'master',
            'masters',
            'phd',
            'science',
            'arts',
            'degree',
            'bs',
            'ms',
            'ba',
            'ma',
            'btech',
            'mtech',
            'related',
            'field',
            'equivalent',
          ]);
          const reqField = new Set([...reqTokens].filter((t) => !degreeWords.has(t)));
          const resField = new Set([...resTokens].filter((t) => !degreeWords.has(t)));
          if (reqField.size === 0 || resField.size === 0) {
            return true;
          }
          for (const t of reqField) {
            if (resField.has(t)) return true;
          }
        }
      }

      return false;
    });

    if (isMatched) {
      matched.push(cleanReq);
    } else {
      missing.push(cleanReq);
    }
  }

  return { matched, missing };
}

function calculateWeightedSkillRatio(items: SkillMatchResult[]): {
  score: number;
  ratio: number;
  matchedCount: number;
  partialCount: number;
  totalCount: number;
} {
  if (items.length === 0) {
    return { score: 100, ratio: 1, matchedCount: 0, partialCount: 0, totalCount: 0 };
  }

  let earnedWeight = 0;
  let totalWeight = 0;
  let matchedCount = 0;
  let partialCount = 0;

  for (const item of items) {
    // Required skills carry 1.0 weight; preferred / nice-to-have skills carry 0.5 weight
    const itemWeight = item.importance === 'required' ? 1.0 : 0.5;
    totalWeight += itemWeight;

    if (item.status === 'matched') {
      earnedWeight += itemWeight;
      matchedCount += 1;
    } else if (item.status === 'partial') {
      earnedWeight += itemWeight * 0.5;
      partialCount += 1;
    }
  }

  const ratio = totalWeight > 0 ? earnedWeight / totalWeight : 0;
  return {
    score: Math.round(ratio * 100),
    ratio,
    matchedCount,
    partialCount,
    totalCount: items.length,
  };
}

function computeRoleContextAlignment(
  resumeTitle: string | undefined,
  resumeExperience: ExperienceProfile,
  jdTitle: string | undefined,
  jdExperience: ExperienceProfile
): number {
  const resumeContext = [
    resumeTitle || '',
    resumeExperience.summary || '',
    ...(resumeExperience.domains || []),
  ].join(' ');
  const jdContext = [
    jdTitle || '',
    jdExperience.summary || '',
    ...(jdExperience.domains || []),
  ].join(' ');

  const resumeTokens = tokenizePhrase(resumeContext, true);
  const jdTokens = tokenizePhrase(jdContext, true);
  return Math.round(diceTokenSimilarity(resumeTokens, jdTokens) * 1000) / 1000;
}

export interface ScoringInput {
  allSkillMatches: SkillMatchResult[];
  resumeExperience: ExperienceProfile;
  jdExperience: ExperienceProfile;
  resumeQualifications: string[];
  jdQualifications: string[];
  resumeCertifications: string[];
  jdCertifications: string[];
  resumeJobTitle?: string;
  jdJobTitle?: string;
}

export interface ScoringOutput {
  scoreBreakdown: CompatibilityScoreBreakdown;
  experienceAlignment: ExperienceAlignment;
}

/**
 * Deterministic, transparent Compatibility Scoring Engine.
 * Never delegates percentage invention to an LLM.
 * Evaluates total experience strictly through its verified job-relevance factor
 * (skill evidence + domain alignment + role/responsibility alignment) so unrelated
 * career years do not inflate compatibility scores.
 */
export function calculateCompatibilityScore(input: ScoringInput): ScoringOutput {
  const {
    allSkillMatches,
    resumeExperience,
    jdExperience,
    resumeQualifications,
    jdQualifications,
    resumeCertifications,
    jdCertifications,
    resumeJobTitle,
    jdJobTitle,
  } = input;

  const techMatches = allSkillMatches.filter((m) => TECHNICAL_CATEGORIES.has(m.category));
  const nonTechMatches = allSkillMatches.filter((m) => m.category === 'soft_skill');

  const isTechnicalRole = techMatches.length > 0;

  const techStats = calculateWeightedSkillRatio(techMatches);
  const nonTechStats = calculateWeightedSkillRatio(nonTechMatches);
  const allSkillStats = calculateWeightedSkillRatio(allSkillMatches);

  // Qualifications & Certifications
  const qualMatch = matchStringLists(resumeQualifications, jdQualifications, {
    allowDegreeHierarchy: true,
  });
  const certMatch = matchStringLists(resumeCertifications, jdCertifications);
  const totalQualItems = jdQualifications.length + jdCertifications.length;
  const matchedQualItems = qualMatch.matched.length + certMatch.matched.length;
  const qualScore =
    totalQualItems > 0 ? Math.round((matchedQualItems / totalQualItems) * 100) : 100;

  // Experience & Domain Alignment (distinguishing total years from job-relevant experience)
  const domainMatch = matchStringLists(resumeExperience.domains, jdExperience.domains);
  const reqYears = jdExperience.estimatedYears;
  const resYears = resumeExperience.estimatedYears;

  let rawYearsScore = 80; // Neutral if JD doesn't state explicit years
  if (reqYears !== null && reqYears > 0) {
    if (resYears === null) {
      rawYearsScore = 40;
    } else if (resYears >= reqYears) {
      rawYearsScore = 100;
    } else {
      rawYearsScore = Math.max(15, Math.round((resYears / reqYears) * 100));
    }
  } else if (reqYears === 0) {
    rawYearsScore = 100;
  }

  const reqRank = parseSeniorityRank(jdExperience.seniorityLevel);
  const resRank = parseSeniorityRank(resumeExperience.seniorityLevel);
  const rawSeniorityScore =
    resRank >= reqRank
      ? 100
      : Math.max(30, Math.round(100 - (reqRank - resRank) * 25));

  const domainRatio =
    jdExperience.domains.length > 0
      ? domainMatch.matched.length / jdExperience.domains.length
      : null;

  const skillRelevanceRatio =
    allSkillMatches.length > 0
      ? isTechnicalRole
        ? techStats.ratio
        : allSkillStats.ratio
      : domainRatio ?? 0;

  const roleAlignmentRatio = computeRoleContextAlignment(
    resumeJobTitle,
    resumeExperience,
    jdJobTitle,
    jdExperience
  );

  // Quadratic skill corroboration (`s^2`) stays near 0 for unrelated/low-match roles
  // (0^2 = 0, 0.25^2 = 0.06) while preventing false experience penalties when a high-match
  // candidate's extracted domain labels use synonyms (e.g. "Software Testing" vs "Quality Assurance").
  const rawDomainSignal = domainRatio !== null ? domainRatio : skillRelevanceRatio;
  const domainSignal =
    domainRatio !== null
      ? Math.max(domainRatio, skillRelevanceRatio * skillRelevanceRatio)
      : skillRelevanceRatio;

  // Deterministic job-relevance factor in [0, 1]:
  // - Zero skill evidence AND zero domain overlap AND low role overlap => 0.0 (unrelated career years earn 0%)
  // - Strong in-domain + skill alignment saturates to 1.0 (in-domain engineers are not double-penalized for missing tools)
  // - Adjacent or purely transferable stacks scale smoothly with verified evidence
  let relevanceFactor = 0;
  if (skillRelevanceRatio === 0 && rawDomainSignal === 0) {
    relevanceFactor = roleAlignmentRatio >= 0.25 ? Math.min(0.35, roleAlignmentRatio) : 0;
  } else {
    const rawRelevance =
      0.55 * Math.min(1, skillRelevanceRatio / 0.55) +
      0.35 * domainSignal +
      0.1 * Math.min(1, roleAlignmentRatio / 0.35);
    relevanceFactor = Math.max(0, Math.min(1, rawRelevance));

    // When 0 exact skills match and all evidence is purely transferable/partial,
    // cap experience relevance at 0.85 so transferable experience is credited fairly
    // without equating to 100% direct stack tenure.
    const hasExactSkillMatch =
      (isTechnicalRole ? techStats.matchedCount : allSkillStats.matchedCount) > 0;
    if (!hasExactSkillMatch && allSkillMatches.length > 0) {
      relevanceFactor = Math.min(relevanceFactor, 0.85);
    }
  }

  relevanceFactor = Math.round(relevanceFactor * 100) / 100;

  const relevantYearsEstimate =
    resYears !== null ? Math.round(resYears * relevanceFactor * 10) / 10 : null;

  // Scale raw years and seniority subscores by verified job relevance
  const effectiveYearsScore = Math.round(rawYearsScore * relevanceFactor);
  const effectiveSeniorityScore = Math.round(rawSeniorityScore * relevanceFactor);
  const domainSubscore = Math.round(domainSignal * 100);

  const experienceScore = Math.round(
    effectiveYearsScore * 0.55 + domainSubscore * 0.3 + effectiveSeniorityScore * 0.15
  );

  const relevancePct = Math.round(relevanceFactor * 100);
  const evidenceSummary =
    relevanceFactor === 0
      ? `0% relevance (0/${Math.max(1, jdExperience.domains.length)} domains aligned, ${Math.round(skillRelevanceRatio * 100)}% skill evidence)`
      : `${relevancePct}% relevance (${domainMatch.matched.length}/${Math.max(1, jdExperience.domains.length)} domains, ${Math.round(skillRelevanceRatio * 100)}% skill evidence, ${Math.round(roleAlignmentRatio * 100)}% role-context overlap)`;

  const experienceBreakdown: ExperienceScoreBreakdown = {
    totalYears: resYears,
    requiredYears: reqYears,
    relevantYearsEstimate,
    yearsSubscore: effectiveYearsScore,
    domainSubscore,
    senioritySubscore: effectiveSeniorityScore,
    roleAlignmentScore: Math.round(roleAlignmentRatio * 100),
    skillRelevanceRatio: Math.round(skillRelevanceRatio * 100) / 100,
    relevanceFactor,
    finalExperienceScore: experienceScore,
    evidenceSummary,
  };

  // Base pillar weights (re-normalized cleanly if a pillar has 0 JD requirements)
  const rawPillars: Array<{
    key: ScorePillarBreakdown['key'];
    label: string;
    baseWeight: number;
    active: boolean;
    rawScore: number;
    formulaNote: string;
    matchedCount?: number;
    partialCount?: number;
    totalCount?: number;
  }> = [
    {
      key: 'technical_skills',
      label: 'Technical Skills Match',
      baseWeight: isTechnicalRole ? 0.55 : 0,
      active: techMatches.length > 0,
      rawScore: techStats.score,
      formulaNote: `${techStats.matchedCount} matched, ${techStats.partialCount} partial (0.5x) of ${techStats.totalCount} technical JD skills`,
      matchedCount: techStats.matchedCount,
      partialCount: techStats.partialCount,
      totalCount: techStats.totalCount,
    },
    {
      key: 'role_and_soft_skills',
      label: isTechnicalRole ? 'Soft & Job-Specific Skills' : 'Core Role & Soft Skills',
      baseWeight: isTechnicalRole ? 0.15 : 0.5,
      active: nonTechMatches.length > 0,
      rawScore: nonTechStats.score,
      formulaNote: `${nonTechStats.matchedCount} matched, ${nonTechStats.partialCount} partial (0.5x) of ${nonTechStats.totalCount} role/soft skills`,
      matchedCount: nonTechStats.matchedCount,
      partialCount: nonTechStats.partialCount,
      totalCount: nonTechStats.totalCount,
    },
    {
      key: 'qualifications',
      label: 'Qualifications & Certifications',
      baseWeight: 0.12,
      active: totalQualItems > 0,
      rawScore: qualScore,
      formulaNote:
        totalQualItems > 0
          ? `${matchedQualItems} of ${totalQualItems} required qualifications/certifications matched`
          : 'No specific degrees or certifications required by JD',
      matchedCount: matchedQualItems,
      totalCount: totalQualItems,
    },
    {
      key: 'experience',
      label: 'Relevant Experience & Domain',
      baseWeight: isTechnicalRole ? 0.18 : 0.38,
      active: true,
      rawScore: experienceScore,
      formulaNote:
        reqYears !== null
          ? `Resume: ${resYears !== null ? `${resYears} total yrs (~${relevantYearsEstimate} relevant)` : 'unspecified'} vs JD: ${reqYears}+ yrs · ${evidenceSummary}`
          : `Seniority (${resumeExperience.seniorityLevel}) · ${evidenceSummary}`,
    },
  ];

  const activeWeightSum = rawPillars
    .filter((p) => p.active && p.baseWeight > 0)
    .reduce((sum, p) => sum + p.baseWeight, 0);

  const pillars: ScorePillarBreakdown[] = rawPillars
    .filter((p) => p.active && p.baseWeight > 0)
    .map((p) => {
      const normalizedWeight = activeWeightSum > 0 ? p.baseWeight / activeWeightSum : 0;
      const weightedContribution = Math.round(p.rawScore * normalizedWeight * 10) / 10;
      return {
        key: p.key,
        label: p.label,
        weight: Math.round(normalizedWeight * 1000) / 1000,
        rawScore: p.rawScore,
        weightedContribution,
        formulaNote: p.formulaNote,
        matchedCount: p.matchedCount,
        partialCount: p.partialCount,
        totalCount: p.totalCount,
      };
    });

  const overallScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(pillars.reduce((sum, p) => sum + p.rawScore * p.weight, 0))
    )
  );

  const summaryFormula = pillars
    .map((p) => `${Math.round(p.weight * 100)}% × ${p.rawScore}% (${p.label.split(' ')[0]})`)
    .join(' + ');

  let assessmentNote = '';
  if (relevanceFactor === 0) {
    assessmentNote =
      resYears !== null
        ? `No job-relevant experience detected (${resYears} total years appear to be in unrelated domains/skills vs ${reqYears !== null ? `${reqYears}+ relevant years` : 'target role requirements'}).`
        : 'No job-relevant domain or skill experience detected for this target role.';
  } else if (reqYears !== null && resYears !== null && relevantYearsEstimate !== null) {
    if (relevanceFactor < 0.5) {
      assessmentNote = `Limited directly relevant experience (~${relevantYearsEstimate} est. relevant yrs from ${resYears} total yrs vs ${reqYears}+ yrs requested; ${relevancePct}% role relevance).`;
    } else if (relevantYearsEstimate >= reqYears) {
      assessmentNote = `Meets relevant experience benchmark (~${relevantYearsEstimate} relevant yrs from ${resYears} total yrs vs ${reqYears}+ yrs requested).`;
    } else {
      assessmentNote = `Relevant experience gap detected (~${relevantYearsEstimate} est. relevant yrs from ${resYears} total yrs vs ${reqYears}+ yrs requested).`;
    }
  } else if (reqYears !== null && resYears === null) {
    assessmentNote = `JD requests ${reqYears}+ years of experience; total years could not be verified from the resume (${relevancePct}% role relevance).`;
  } else {
    assessmentNote = `Evaluated on role-relevant seniority (${resumeExperience.seniorityLevel} vs ${jdExperience.seniorityLevel}) and domain overlap (${relevancePct}% relevance).`;
  }

  return {
    scoreBreakdown: {
      overallScore,
      pillars,
      summaryFormula: `${summaryFormula} = ${overallScore}%`,
      isTechnicalRole,
    },
    experienceAlignment: {
      resumeYears: resYears,
      requiredYears: reqYears,
      resumeSeniority: resumeExperience.seniorityLevel || 'Unspecified',
      requiredSeniority: jdExperience.seniorityLevel || 'Unspecified',
      matchedDomains: domainMatch.matched,
      missingDomains: domainMatch.missing,
      matchedQualifications: qualMatch.matched,
      missingQualifications: qualMatch.missing,
      matchedCertifications: certMatch.matched,
      missingCertifications: certMatch.missing,
      assessmentNote,
      relevanceFactor,
      relevantYearsEstimate,
      experienceBreakdown,
    },
  };
}
