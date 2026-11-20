import type {
  CompatibilityScoreBreakdown,
  ExperienceAlignment,
  ExperienceProfile,
  ScorePillarBreakdown,
  SkillCategory,
  SkillMatchResult,
} from '../types/analysis.ts';
import { lexicalSemanticSimilarity } from './matchingEngine.ts';

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

function parseSeniorityRank(level: string): number {
  const lower = (level || '').toLowerCase();
  for (const [key, rank] of Object.entries(SENIORITY_RANK)) {
    if (lower.includes(key)) return rank;
  }
  return 2; // neutral default if unspecified
}

function matchStringLists(
  resumeItems: string[],
  jdItems: string[]
): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];

  for (const req of jdItems) {
    const cleanReq = req.trim();
    if (!cleanReq) continue;

    const isMatched = resumeItems.some((res) => {
      const cleanRes = res.trim();
      if (!cleanRes) return false;
      const sim = lexicalSemanticSimilarity(cleanReq, cleanRes);
      if (sim >= 0.6) return true;
      // Handle degree hierarchy (Master's/PhD satisfies Bachelor's in similar field)
      const reqLower = cleanReq.toLowerCase();
      const resLower = cleanRes.toLowerCase();
      if (
        (reqLower.includes('bachelor') || reqLower.includes('bs') || reqLower.includes('b.tech') || reqLower.includes('degree')) &&
        (resLower.includes('bachelor') || resLower.includes('master') || resLower.includes('phd') || resLower.includes('b.tech') || resLower.includes('m.tech') || resLower.includes('b.s') || resLower.includes('m.s'))
      ) {
        return true;
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
  matchedCount: number;
  partialCount: number;
  totalCount: number;
} {
  if (items.length === 0) {
    return { score: 100, matchedCount: 0, partialCount: 0, totalCount: 0 };
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
    matchedCount,
    partialCount,
    totalCount: items.length,
  };
}

export interface ScoringInput {
  allSkillMatches: SkillMatchResult[];
  resumeExperience: ExperienceProfile;
  jdExperience: ExperienceProfile;
  resumeQualifications: string[];
  jdQualifications: string[];
  resumeCertifications: string[];
  jdCertifications: string[];
}

export interface ScoringOutput {
  scoreBreakdown: CompatibilityScoreBreakdown;
  experienceAlignment: ExperienceAlignment;
}

/**
 * Deterministic, transparent Compatibility Scoring Engine.
 * Never delegates percentage invention to an LLM.
 * Computes weighted score strictly from verified skill matches, qualifications,
 * certifications, and experience alignment, with dynamic weight renormalization
 * if a category is absent from the Job Description (e.g., non-technical roles).
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
  } = input;

  const techMatches = allSkillMatches.filter((m) => TECHNICAL_CATEGORIES.has(m.category));
  const nonTechMatches = allSkillMatches.filter(
    (m) => m.category === 'soft_skill'
  );

  const isTechnicalRole = techMatches.length > 0;

  const techStats = calculateWeightedSkillRatio(techMatches);
  const nonTechStats = calculateWeightedSkillRatio(nonTechMatches);

  // Qualifications & Certifications
  const qualMatch = matchStringLists(resumeQualifications, jdQualifications);
  const certMatch = matchStringLists(resumeCertifications, jdCertifications);
  const totalQualItems = jdQualifications.length + jdCertifications.length;
  const matchedQualItems = qualMatch.matched.length + certMatch.matched.length;
  const qualScore =
    totalQualItems > 0 ? Math.round((matchedQualItems / totalQualItems) * 100) : 100;

  // Experience & Domain Alignment
  const domainMatch = matchStringLists(resumeExperience.domains, jdExperience.domains);
  const reqYears = jdExperience.estimatedYears;
  const resYears = resumeExperience.estimatedYears;

  let yearsScore = 80; // Neutral if JD doesn't state explicit years
  if (reqYears !== null && reqYears > 0) {
    if (resYears === null) {
      yearsScore = 40;
    } else if (resYears >= reqYears) {
      yearsScore = 100;
    } else {
      yearsScore = Math.max(15, Math.round((resYears / reqYears) * 100));
    }
  } else if (reqYears === 0) {
    yearsScore = 100;
  }

  const reqRank = parseSeniorityRank(jdExperience.seniorityLevel);
  const resRank = parseSeniorityRank(resumeExperience.seniorityLevel);
  const seniorityScore =
    resRank >= reqRank
      ? 100
      : Math.max(30, Math.round(100 - (reqRank - resRank) * 25));

  const domainScore =
    jdExperience.domains.length > 0
      ? Math.round((domainMatch.matched.length / jdExperience.domains.length) * 100)
      : yearsScore;

  const experienceScore = Math.round(
    yearsScore * 0.55 + domainScore * 0.3 + seniorityScore * 0.15
  );

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
          ? `Resume: ${resYears !== null ? `${resYears} yrs` : 'unspecified'} vs JD: ${reqYears}+ yrs · ${domainMatch.matched.length}/${Math.max(1, jdExperience.domains.length)} domains aligned`
          : `Seniority (${resumeExperience.seniorityLevel}) & ${domainMatch.matched.length}/${Math.max(1, jdExperience.domains.length)} domains aligned`,
    },
  ];

  const activeWeightSum = rawPillars
    .filter((p) => p.active && p.baseWeight > 0)
    .reduce((sum, p) => sum + p.baseWeight, 0);

  const pillars: ScorePillarBreakdown[] = rawPillars
    .filter((p) => p.active && p.baseWeight > 0)
    .map((p) => {
      const normalizedWeight =
        activeWeightSum > 0 ? p.baseWeight / activeWeightSum : 0;
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
  if (reqYears !== null && resYears !== null) {
    if (resYears >= reqYears) {
      assessmentNote = `Meets experience benchmark (${resYears} years detected vs ${reqYears}+ years requested).`;
    } else {
      assessmentNote = `Experience gap detected (${resYears} years detected vs ${reqYears}+ years requested).`;
    }
  } else if (reqYears !== null && resYears === null) {
    assessmentNote = `JD requests ${reqYears}+ years of experience; total years could not be verified from the resume.`;
  } else {
    assessmentNote = `Evaluated on seniority alignment (${resumeExperience.seniorityLevel} vs ${jdExperience.seniorityLevel}) and domain overlap.`;
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
    },
  };
}
