import type {
  AnalysisHistoryItem,
  AnalysisReport,
  CompatibilityScoreBreakdown,
  DocumentExtractionMeta,
  ExperienceAlignment,
  QuickScanResult,
} from '../types/analysis';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeResumeExtractionMethod(
  value: unknown
): DocumentExtractionMeta['resumeExtractionMethod'] {
  if (value === 'gemini_ocr' || value === 'hybrid_ocr' || value === 'pdf_text') {
    return value;
  }
  return 'pdf_text';
}

function normalizeJdExtractionMethod(
  value: unknown
): DocumentExtractionMeta['jdExtractionMethod'] {
  if (
    value === 'direct_text' ||
    value === 'pdf_text' ||
    value === 'gemini_ocr' ||
    value === 'hybrid_ocr'
  ) {
    return value;
  }
  return 'direct_text';
}

/**
 * Runtime shape validation for AnalysisReport responses to prevent malformed
 * server payloads or corrupted database records from crashing React views.
 */
export function validateAnalysisReport(raw: unknown): AnalysisReport {
  if (!isRecord(raw)) {
    throw new Error('Server returned an invalid analysis report format.');
  }

  const compatibilityScore =
    typeof raw.compatibilityScore === 'number' && Number.isFinite(raw.compatibilityScore)
      ? Math.max(0, Math.min(100, raw.compatibilityScore))
      : null;

  if (compatibilityScore === null) {
    throw new Error('Analysis report is missing a valid compatibility score.');
  }

  const rawBreakdown = isRecord(raw.scoreBreakdown) ? raw.scoreBreakdown : null;
  const scoreBreakdown: CompatibilityScoreBreakdown = {
    overallScore:
      rawBreakdown && typeof rawBreakdown.overallScore === 'number'
        ? rawBreakdown.overallScore
        : compatibilityScore,
    pillars:
      rawBreakdown && Array.isArray(rawBreakdown.pillars)
        ? (rawBreakdown.pillars as CompatibilityScoreBreakdown['pillars'])
        : [],
    summaryFormula:
      rawBreakdown && typeof rawBreakdown.summaryFormula === 'string'
        ? rawBreakdown.summaryFormula
        : '',
    isTechnicalRole:
      rawBreakdown && typeof rawBreakdown.isTechnicalRole === 'boolean'
        ? rawBreakdown.isTechnicalRole
        : true,
  };

  const rawMeta = isRecord(raw.extractionMeta) ? raw.extractionMeta : null;
  const extractionMeta: DocumentExtractionMeta = {
    resumePageCount:
      rawMeta && typeof rawMeta.resumePageCount === 'number' ? rawMeta.resumePageCount : 1,
    resumeExtractionMethod: normalizeResumeExtractionMethod(rawMeta?.resumeExtractionMethod),
    resumeCharCount:
      rawMeta && typeof rawMeta.resumeCharCount === 'number' ? rawMeta.resumeCharCount : 0,
    jdInputType: rawMeta?.jdInputType === 'pdf' ? 'pdf' : 'text',
    jdPageCount: rawMeta && typeof rawMeta.jdPageCount === 'number' ? rawMeta.jdPageCount : null,
    jdExtractionMethod: normalizeJdExtractionMethod(rawMeta?.jdExtractionMethod),
    jdCharCount: rawMeta && typeof rawMeta.jdCharCount === 'number' ? rawMeta.jdCharCount : 0,
    semanticMatchingEngine:
      rawMeta?.semanticMatchingEngine === 'gemini_embedding_2'
        ? 'gemini_embedding_2'
        : 'lexical_fallback',
    processingTimeMs:
      rawMeta && typeof rawMeta.processingTimeMs === 'number' ? rawMeta.processingTimeMs : 0,
  };

  const rawAlign = isRecord(raw.experienceAlignment) ? raw.experienceAlignment : null;
  const experienceAlignment: ExperienceAlignment = {
    resumeYears: rawAlign && typeof rawAlign.resumeYears === 'number' ? rawAlign.resumeYears : null,
    requiredYears:
      rawAlign && typeof rawAlign.requiredYears === 'number' ? rawAlign.requiredYears : null,
    resumeSeniority:
      rawAlign && typeof rawAlign.resumeSeniority === 'string'
        ? rawAlign.resumeSeniority
        : 'Unspecified',
    requiredSeniority:
      rawAlign && typeof rawAlign.requiredSeniority === 'string'
        ? rawAlign.requiredSeniority
        : 'Unspecified',
    matchedDomains: asStringArray(rawAlign?.matchedDomains),
    missingDomains: asStringArray(rawAlign?.missingDomains),
    matchedQualifications: asStringArray(rawAlign?.matchedQualifications),
    missingQualifications: asStringArray(rawAlign?.missingQualifications),
    matchedCertifications: asStringArray(rawAlign?.matchedCertifications),
    missingCertifications: asStringArray(rawAlign?.missingCertifications),
    assessmentNote:
      rawAlign && typeof rawAlign.assessmentNote === 'string' ? rawAlign.assessmentNote : '',
  };

  const completedDays = Array.isArray(raw.completedDays)
    ? raw.completedDays.filter((d): d is number => typeof d === 'number' && Number.isInteger(d))
    : [];

  return {
    ...(raw as unknown as AnalysisReport),
    id: typeof raw.id === 'number' || typeof raw.id === 'string' ? raw.id : 'session',
    saved: Boolean(raw.saved),
    jobTitle: typeof raw.jobTitle === 'string' && raw.jobTitle.trim() ? raw.jobTitle : 'Untitled Role',
    companyName: typeof raw.companyName === 'string' ? raw.companyName : null,
    resumeFilename:
      typeof raw.resumeFilename === 'string' && raw.resumeFilename.trim()
        ? raw.resumeFilename
        : 'resume.pdf',
    jdSourceName:
      typeof raw.jdSourceName === 'string' && raw.jdSourceName.trim()
        ? raw.jdSourceName
        : 'Job Description',
    jdText: typeof raw.jdText === 'string' ? raw.jdText : '',
    resumeTextExcerpt: typeof raw.resumeTextExcerpt === 'string' ? raw.resumeTextExcerpt : '',
    compatibilityScore,
    scoreBreakdown,
    extractionMeta,
    experienceAlignment,
    matchedSkills: Array.isArray(raw.matchedSkills) ? raw.matchedSkills : [],
    partialSkills: Array.isArray(raw.partialSkills) ? raw.partialSkills : [],
    missingSkills: Array.isArray(raw.missingSkills) ? raw.missingSkills : [],
    resumeSkills: Array.isArray(raw.resumeSkills) ? raw.resumeSkills : [],
    jdSkills: Array.isArray(raw.jdSkills) ? raw.jdSkills : [],
    learningPlan: Array.isArray(raw.learningPlan) ? raw.learningPlan : [],
    completedDays,
    createdAt:
      typeof raw.createdAt === 'string' && raw.createdAt
        ? raw.createdAt
        : new Date().toISOString(),
  };
}

export function validateHistoryResponse(raw: unknown): AnalysisHistoryItem[] {
  if (!isRecord(raw) || !Array.isArray(raw.analyses)) {
    throw new Error('Server returned an unexpected analysis history response.');
  }

  return raw.analyses
    .filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.id === 'number')
    .map((item) => ({
      id: item.id as number,
      jobTitle: typeof item.jobTitle === 'string' ? item.jobTitle : 'Untitled Role',
      companyName: typeof item.companyName === 'string' ? item.companyName : null,
      resumeFilename: typeof item.resumeFilename === 'string' ? item.resumeFilename : 'resume.pdf',
      jdSourceName: typeof item.jdSourceName === 'string' ? item.jdSourceName : 'Job Description',
      compatibilityScore:
        typeof item.compatibilityScore === 'number' && Number.isFinite(item.compatibilityScore)
          ? item.compatibilityScore
          : 0,
      matchedCount: typeof item.matchedCount === 'number' ? item.matchedCount : 0,
      partialCount: typeof item.partialCount === 'number' ? item.partialCount : 0,
      missingCount: typeof item.missingCount === 'number' ? item.missingCount : 0,
      completedDaysCount:
        typeof item.completedDaysCount === 'number' ? item.completedDaysCount : 0,
      createdAt:
        typeof item.createdAt === 'string' && item.createdAt
          ? item.createdAt
          : new Date().toISOString(),
    }));
}

export function validateQuickScanResult(raw: unknown): QuickScanResult {
  if (!isRecord(raw)) {
    throw new Error('Server returned an invalid Quick Scan response.');
  }

  return {
    jobTitle: typeof raw.jobTitle === 'string' && raw.jobTitle.trim() ? raw.jobTitle : 'Target Role',
    companyName: typeof raw.companyName === 'string' ? raw.companyName : null,
    seniorityLevel: typeof raw.seniorityLevel === 'string' ? raw.seniorityLevel : 'Unspecified',
    requiredYears: typeof raw.requiredYears === 'number' ? raw.requiredYears : null,
    topSkills: asStringArray(raw.topSkills),
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    latencyMs: typeof raw.latencyMs === 'number' ? raw.latencyMs : 0,
  };
}

export function validateCoachResponse(raw: unknown): { answer: string; latencyMs: number } {
  if (!isRecord(raw) || typeof raw.answer !== 'string' || !raw.answer.trim()) {
    throw new Error('Gap Advisor returned an empty or invalid response. Please try again.');
  }

  return {
    answer: raw.answer,
    latencyMs: typeof raw.latencyMs === 'number' ? raw.latencyMs : 0,
  };
}
