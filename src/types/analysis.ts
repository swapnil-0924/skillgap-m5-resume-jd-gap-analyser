export type SkillCategory =
  | 'programming_language'
  | 'framework'
  | 'library'
  | 'database'
  | 'cloud'
  | 'dev_tool'
  | 'technical_skill'
  | 'soft_skill'
  | 'qualification'
  | 'certification';

export type SkillImportance = 'required' | 'preferred';

export type MatchStatus = 'matched' | 'partial' | 'missing';

export type MatchMethod = 'exact_normalized' | 'semantic_embedding' | 'semantic_lexical' | 'none';

export interface ExtractedSkillItem {
  rawName: string;
  canonicalName: string;
  category: SkillCategory;
  importance?: SkillImportance;
  evidenceQuote?: string;
}

export interface ExperienceProfile {
  estimatedYears: number | null;
  seniorityLevel: string;
  domains: string[];
  summary: string;
}

export interface StructuredDocumentExtraction {
  jobTitle?: string;
  companyName?: string;
  skills: ExtractedSkillItem[];
  qualifications: string[];
  certifications: string[];
  experience: ExperienceProfile;
}

export interface SkillMatchResult {
  jdSkill: string;
  rawJdSkill: string;
  category: SkillCategory;
  importance: SkillImportance;
  status: MatchStatus;
  matchMethod: MatchMethod;
  similarityScore: number; // 0 to 1
  matchedResumeSkill: string | null;
  jdEvidence: string;
  evidenceVerified: boolean;
  reviewRequired?: boolean;
  matchReason?: string;
}

export interface ScorePillarBreakdown {
  key: 'technical_skills' | 'role_and_soft_skills' | 'qualifications' | 'experience';
  label: string;
  weight: number; // 0 to 1 (sums to 1)
  rawScore: number; // 0 to 100
  weightedContribution: number; // 0 to 100
  formulaNote: string;
  matchedCount?: number;
  partialCount?: number;
  totalCount?: number;
}

export interface CompatibilityScoreBreakdown {
  overallScore: number; // 0 to 100
  pillars: ScorePillarBreakdown[];
  summaryFormula: string;
  isTechnicalRole: boolean;
}

export interface ExperienceScoreBreakdown {
  totalYears: number | null;
  requiredYears: number | null;
  relevantYearsEstimate: number | null;
  yearsSubscore: number;
  domainSubscore: number;
  senioritySubscore: number;
  roleAlignmentScore: number;
  skillRelevanceRatio: number;
  relevanceFactor: number;
  finalExperienceScore: number;
  evidenceSummary: string;
}

export interface ExperienceAlignment {
  resumeYears: number | null;
  requiredYears: number | null;
  resumeSeniority: string;
  requiredSeniority: string;
  matchedDomains: string[];
  missingDomains: string[];
  matchedQualifications: string[];
  missingQualifications: string[];
  matchedCertifications: string[];
  missingCertifications: string[];
  assessmentNote: string;
  relevanceFactor?: number;
  relevantYearsEstimate?: number | null;
  experienceBreakdown?: ExperienceScoreBreakdown;
}

export interface LearningDayPlan {
  day: number;
  skill: string;
  priority: 'High' | 'Medium' | 'Foundational';
  objective: string;
  activities: string[];
  exercise: string;
  expectedOutcome: string;
  estimatedHours: number;
}

export interface EmbeddingDiagnostics {
  provider: string;
  status: 'succeeded' | 'partial' | 'fallback' | 'skipped';
  requestedCount: number;
  embeddedCount: number;
  fallbackReason: string | null;
  latencyMs: number;
}

export interface DocumentExtractionMeta {
  resumePageCount: number;
  resumeExtractionMethod: 'pdf_text' | 'gemini_ocr' | 'hybrid_ocr';
  resumeCharCount: number;
  jdInputType: 'text' | 'pdf';
  jdPageCount: number | null;
  jdExtractionMethod: 'direct_text' | 'pdf_text' | 'gemini_ocr' | 'hybrid_ocr';
  jdCharCount: number;
  semanticMatchingEngine: 'gemini_embedding_2' | 'lexical_fallback';
  embeddingDiagnostics?: EmbeddingDiagnostics;
  processingTimeMs: number;
}

export interface AnalysisReport {
  id: number | string;
  saved: boolean;
  resumeFilename: string;
  jobTitle: string;
  companyName: string | null;
  jdSourceName: string;
  jdText: string;
  resumeTextExcerpt: string;
  extractionMeta: DocumentExtractionMeta;
  compatibilityScore: number;
  scoreBreakdown: CompatibilityScoreBreakdown;
  matchedSkills: SkillMatchResult[];
  partialSkills: SkillMatchResult[];
  missingSkills: SkillMatchResult[];
  resumeSkills: ExtractedSkillItem[];
  jdSkills: ExtractedSkillItem[];
  experienceAlignment: ExperienceAlignment;
  learningPlan: LearningDayPlan[];
  completedDays: number[];
  createdAt: string;
}

export interface AnalysisHistoryItem {
  id: number;
  resumeFilename: string;
  jobTitle: string;
  companyName: string | null;
  jdSourceName: string;
  compatibilityScore: number;
  matchedCount: number;
  partialCount: number;
  missingCount: number;
  completedDaysCount: number;
  createdAt: string;
}

export interface QuickScanResult {
  jobTitle: string;
  companyName: string | null;
  requiredYears: number | null;
  seniorityLevel: string;
  topSkills: string[];
  summary: string;
  latencyMs: number;
}
