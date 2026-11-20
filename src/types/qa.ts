export type QaTestCategory =
  | 'unit'
  | 'integration'
  | 'api'
  | 'e2e'
  | 'security'
  | 'ai_regression';

export type QaRunType = 'all' | QaTestCategory;

export type QaTestStatus = 'passed' | 'failed' | 'blocked' | 'skipped';

export type QaRunOverallStatus = 'running' | 'passed' | 'failed' | 'partial' | 'crashed';

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type SecurityFindingStatus = 'open' | 'verified_secure' | 'mitigated' | 'blocked';

export type SecurityAuditOverallStatus = 'passed' | 'findings_open' | 'failed' | 'blocked';

export interface QaTestCaseRecord {
  id: number;
  testName: string;
  category: QaTestCategory;
  description: string;
  enabled: boolean;
}

export interface QaTestResultRecord {
  id: number;
  runId: number;
  testCaseId: number;
  testName: string;
  category: QaTestCategory;
  description: string;
  status: QaTestStatus;
  durationMs: number;
  errorSummary: string | null;
  executionDetails: Record<string, unknown> | null;
  createdAt: string;
}

export interface QaTestRunSummary {
  id: number;
  runType: QaRunType;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  totalTests: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  passPercentage: number;
  overallStatus: QaRunOverallStatus;
  applicationVersion: string;
  commitHash: string | null;
}

export interface SecurityFindingRecord {
  id: number;
  auditId: number;
  runId?: number;
  findingCode: string;
  title: string;
  severity: SecuritySeverity;
  status: SecurityFindingStatus;
  description: string;
  remediation: string;
  verifiedAt: string | null;
}

export interface SecurityAuditRecord {
  id: number;
  runId: number;
  auditType: string;
  overallStatus: SecurityAuditOverallStatus;
  createdAt: string;
  findings: SecurityFindingRecord[];
}

export interface QaRunComparison {
  latestRunId: number;
  previousRunId: number;
  passRateDelta: number;
  passedDelta: number;
  failedDelta: number;
  blockedDelta: number;
  durationDeltaMs: number;
  regressions: string[];
  improvements: string[];
}

export interface QaRunDetailResponse {
  run: QaTestRunSummary;
  results: QaTestResultRecord[];
  securityAudit: SecurityAuditRecord | null;
  comparison: QaRunComparison | null;
}

export interface QaOverviewResponse {
  totalRuns: number;
  totalTestCases: number;
  enabledTestCases: number;
  isRunInProgress: boolean;
  activeRunType: QaRunType | null;
  latestRun: QaTestRunSummary | null;
  previousRun: QaTestRunSummary | null;
  comparison: QaRunComparison | null;
  latestSecurityAudit: SecurityAuditRecord | null;
  openFindingsBySeverity: Record<SecuritySeverity, number>;
  recentRuns: QaTestRunSummary[];
}

export interface QaAccessResponse {
  authenticated: boolean;
  isAdmin: boolean;
  email: string | null;
}
