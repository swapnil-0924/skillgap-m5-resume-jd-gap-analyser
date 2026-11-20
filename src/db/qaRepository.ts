import { and, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  securityAudits,
  securityFindings,
  testCases,
  testResults,
  testRuns,
} from './schema.ts';
import type {
  QaOverviewResponse,
  QaRunComparison,
  QaRunDetailResponse,
  QaRunOverallStatus,
  QaRunType,
  QaTestCaseRecord,
  QaTestCategory,
  QaTestResultRecord,
  QaTestRunSummary,
  QaTestStatus,
  SecurityAuditOverallStatus,
  SecurityAuditRecord,
  SecurityFindingRecord,
  SecurityFindingStatus,
  SecuritySeverity,
} from '../types/qa.ts';

export interface TestCaseCatalogEntry {
  testName: string;
  category: QaTestCategory;
  description: string;
  enabled: boolean;
}

export interface TestResultInsertInput {
  testCaseId: number;
  status: QaTestStatus;
  durationMs: number;
  errorSummary: string | null;
  executionDetails: Record<string, unknown> | null;
}

export interface SecurityFindingInsertInput {
  findingCode: string;
  title: string;
  severity: SecuritySeverity;
  status: SecurityFindingStatus;
  description: string;
  remediation: string;
  verifiedAt: Date | null;
}

const SENSITIVE_KEY_PATTERN = /(api[_-]?key|password|secret|token|authorization|cookie|resume_?text|raw_?pdf|ssn|phone|address)/i;
const SECRET_VALUE_PATTERN = /(AIza[0-9A-Za-z\-_]{20,}|Bearer\s+[A-Za-z0-9\-._~+/]+=*|-----BEGIN\s+[A-Z ]+-----)/gi;

function sanitizeString(value: string, maxLength = 800): string {
  return value.replace(SECRET_VALUE_PATTERN, '[REDACTED]').slice(0, maxLength);
}

export function sanitizeExecutionDetails(
  input: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!input) return null;
  const clean = (val: unknown, depth: number): unknown => {
    if (depth > 4) return '[TRUNCATED]';
    if (val === null || val === undefined) return val;
    if (typeof val === 'string') return sanitizeString(val, 400);
    if (typeof val === 'number' || typeof val === 'boolean') return val;
    if (Array.isArray(val)) {
      return val.slice(0, 25).map((item) => clean(item, depth + 1));
    }
    if (typeof val === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>).slice(0, 30)) {
        if (SENSITIVE_KEY_PATTERN.test(k)) {
          out[k] = '[REDACTED]';
        } else {
          out[k] = clean(v, depth + 1);
        }
      }
      return out;
    }
    return String(val).slice(0, 200);
  };
  return clean(input, 0) as Record<string, unknown>;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(
    process.env.SQL_HOST &&
      process.env.SQL_USER &&
      process.env.SQL_DB_NAME
  );
}

function mapRunRow(row: typeof testRuns.$inferSelect): QaTestRunSummary {
  const startedMs = row.startedAt.getTime();
  const completedMs = row.completedAt ? row.completedAt.getTime() : startedMs;
  const durationMs = Math.max(0, completedMs - startedMs);
  const executed = row.passed + row.failed;
  const passPercentage =
    executed > 0
      ? Math.round((row.passed / executed) * 1000) / 10
      : row.totalTests > 0
        ? Math.round((row.passed / row.totalTests) * 1000) / 10
        : 0;

  return {
    id: row.id,
    runType: row.runType as QaRunType,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    durationMs,
    totalTests: row.totalTests,
    passed: row.passed,
    failed: row.failed,
    blocked: row.blocked,
    skipped: row.skipped,
    passPercentage,
    overallStatus: row.overallStatus as QaRunOverallStatus,
    applicationVersion: row.applicationVersion,
    commitHash: row.commitHash,
  };
}

function mapFindingRow(
  row: typeof securityFindings.$inferSelect,
  runId?: number
): SecurityFindingRecord {
  return {
    id: row.id,
    auditId: row.auditId,
    runId,
    findingCode: row.findingCode,
    title: row.title,
    severity: row.severity as SecuritySeverity,
    status: row.status as SecurityFindingStatus,
    description: row.description,
    remediation: row.remediation,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
  };
}

export async function syncTestCaseCatalog(
  definitions: TestCaseCatalogEntry[]
): Promise<Map<string, number>> {
  const idMap = new Map<string, number>();

  for (const def of definitions) {
    const [row] = await db
      .insert(testCases)
      .values({
        testName: def.testName,
        category: def.category,
        description: def.description,
        enabled: def.enabled,
      })
      .onConflictDoUpdate({
        target: testCases.testName,
        set: {
          category: def.category,
          description: def.description,
          enabled: def.enabled,
        },
      })
      .returning({ id: testCases.id, testName: testCases.testName });

    idMap.set(row.testName, row.id);
  }

  return idMap;
}

export async function listTestCases(): Promise<QaTestCaseRecord[]> {
  const rows = await db
    .select()
    .from(testCases)
    .orderBy(testCases.category, testCases.testName);

  return rows.map((row) => ({
    id: row.id,
    testName: row.testName,
    category: row.category as QaTestCategory,
    description: row.description,
    enabled: row.enabled,
  }));
}

export async function createTestRun(params: {
  runType: QaRunType;
  applicationVersion: string;
  commitHash: string | null;
}): Promise<QaTestRunSummary> {
  const [inserted] = await db
    .insert(testRuns)
    .values({
      runType: params.runType,
      overallStatus: 'running',
      applicationVersion: params.applicationVersion,
      commitHash: params.commitHash,
    })
    .returning();

  return mapRunRow(inserted);
}

export async function recordTestResults(
  runId: number,
  results: TestResultInsertInput[]
): Promise<void> {
  if (results.length === 0) return;

  await db.insert(testResults).values(
    results.map((item) => ({
      runId,
      testCaseId: item.testCaseId,
      status: item.status,
      durationMs: Math.max(0, Math.round(item.durationMs)),
      errorSummary: item.errorSummary ? sanitizeString(item.errorSummary, 1000) : null,
      executionDetails: sanitizeExecutionDetails(item.executionDetails),
    }))
  );
}

export async function completeTestRun(
  runId: number,
  summary: {
    totalTests: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    overallStatus: QaRunOverallStatus;
  }
): Promise<QaTestRunSummary> {
  const [updated] = await db
    .update(testRuns)
    .set({
      completedAt: new Date(),
      totalTests: Math.max(0, summary.totalTests),
      passed: Math.max(0, summary.passed),
      failed: Math.max(0, summary.failed),
      blocked: Math.max(0, summary.blocked),
      skipped: Math.max(0, summary.skipped),
      overallStatus: summary.overallStatus,
    })
    .where(eq(testRuns.id, runId))
    .returning();

  return mapRunRow(updated);
}

export async function markTestRunCrashed(
  runId: number,
  partialCounts: {
    totalTests: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
  }
): Promise<QaTestRunSummary | null> {
  const [updated] = await db
    .update(testRuns)
    .set({
      completedAt: new Date(),
      totalTests: Math.max(0, partialCounts.totalTests),
      passed: Math.max(0, partialCounts.passed),
      failed: Math.max(0, partialCounts.failed),
      blocked: Math.max(0, partialCounts.blocked),
      skipped: Math.max(0, partialCounts.skipped),
      overallStatus: 'crashed',
    })
    .where(eq(testRuns.id, runId))
    .returning();

  return updated ? mapRunRow(updated) : null;
}

export async function createSecurityAuditWithFindings(params: {
  runId: number;
  auditType: string;
  overallStatus: SecurityAuditOverallStatus;
  findings: SecurityFindingInsertInput[];
}): Promise<SecurityAuditRecord> {
  const [auditRow] = await db
    .insert(securityAudits)
    .values({
      runId: params.runId,
      auditType: params.auditType,
      overallStatus: params.overallStatus,
    })
    .returning();

  let findingRows: Array<typeof securityFindings.$inferSelect> = [];
  if (params.findings.length > 0) {
    findingRows = await db
      .insert(securityFindings)
      .values(
        params.findings.map((f) => ({
          auditId: auditRow.id,
          findingCode: f.findingCode,
          title: sanitizeString(f.title, 240),
          severity: f.severity,
          status: f.status,
          description: sanitizeString(f.description, 1500),
          remediation: sanitizeString(f.remediation, 1500),
          verifiedAt: f.verifiedAt,
        }))
      )
      .returning();
  }

  return {
    id: auditRow.id,
    runId: auditRow.runId,
    auditType: auditRow.auditType,
    overallStatus: auditRow.overallStatus as SecurityAuditOverallStatus,
    createdAt: auditRow.createdAt.toISOString(),
    findings: findingRows.map((row) => mapFindingRow(row, auditRow.runId)),
  };
}

async function fetchResultsForRun(runId: number): Promise<QaTestResultRecord[]> {
  const rows = await db
    .select({
      result: testResults,
      testCase: testCases,
    })
    .from(testResults)
    .innerJoin(testCases, eq(testResults.testCaseId, testCases.id))
    .where(eq(testResults.runId, runId))
    .orderBy(testCases.category, testCases.testName);

  return rows.map(({ result, testCase }) => ({
    id: result.id,
    runId: result.runId,
    testCaseId: result.testCaseId,
    testName: testCase.testName,
    category: testCase.category as QaTestCategory,
    description: testCase.description,
    status: result.status as QaTestStatus,
    durationMs: result.durationMs,
    errorSummary: result.errorSummary,
    executionDetails: result.executionDetails ?? null,
    createdAt: result.createdAt.toISOString(),
  }));
}

async function fetchSecurityAuditForRun(runId: number): Promise<SecurityAuditRecord | null> {
  const [auditRow] = await db
    .select()
    .from(securityAudits)
    .where(eq(securityAudits.runId, runId))
    .orderBy(desc(securityAudits.createdAt))
    .limit(1);

  if (!auditRow) return null;

  const findingRows = await db
    .select()
    .from(securityFindings)
    .where(eq(securityFindings.auditId, auditRow.id))
    .orderBy(securityFindings.findingCode);

  return {
    id: auditRow.id,
    runId: auditRow.runId,
    auditType: auditRow.auditType,
    overallStatus: auditRow.overallStatus as SecurityAuditOverallStatus,
    createdAt: auditRow.createdAt.toISOString(),
    findings: findingRows.map((row) => mapFindingRow(row, auditRow.runId)),
  };
}

async function buildComparison(
  latestRun: QaTestRunSummary,
  previousRun: QaTestRunSummary | null,
  latestResults?: QaTestResultRecord[]
): Promise<QaRunComparison | null> {
  if (!previousRun) return null;

  const currentRes = latestResults ?? (await fetchResultsForRun(latestRun.id));
  const prevRes = await fetchResultsForRun(previousRun.id);

  const prevByName = new Map(prevRes.map((r) => [r.testName, r.status]));
  const regressions: string[] = [];
  const improvements: string[] = [];

  for (const res of currentRes) {
    const prior = prevByName.get(res.testName);
    if (!prior) continue;
    if (prior === 'passed' && res.status === 'failed') {
      regressions.push(res.testName);
    } else if ((prior === 'failed' || prior === 'blocked') && res.status === 'passed') {
      improvements.push(res.testName);
    }
  }

  return {
    latestRunId: latestRun.id,
    previousRunId: previousRun.id,
    passRateDelta: Math.round((latestRun.passPercentage - previousRun.passPercentage) * 10) / 10,
    passedDelta: latestRun.passed - previousRun.passed,
    failedDelta: latestRun.failed - previousRun.failed,
    blockedDelta: latestRun.blocked - previousRun.blocked,
    durationDeltaMs: latestRun.durationMs - previousRun.durationMs,
    regressions,
    improvements,
  };
}

export async function listTestRuns(filters?: {
  runType?: QaRunType;
  status?: QaRunOverallStatus;
  from?: Date;
  to?: Date;
  limit?: number;
}): Promise<QaTestRunSummary[]> {
  const conditions = [];
  if (filters?.runType) {
    conditions.push(eq(testRuns.runType, filters.runType));
  }
  if (filters?.status) {
    conditions.push(eq(testRuns.overallStatus, filters.status));
  }
  if (filters?.from) {
    conditions.push(gte(testRuns.startedAt, filters.from));
  }
  if (filters?.to) {
    conditions.push(lte(testRuns.startedAt, filters.to));
  }

  const limit = Math.min(Math.max(filters?.limit ?? 50, 1), 100);
  const rows = await db
    .select()
    .from(testRuns)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(testRuns.startedAt), desc(testRuns.id))
    .limit(limit);

  return rows.map(mapRunRow);
}

export async function getTestRunDetail(runId: number): Promise<QaRunDetailResponse | null> {
  const [runRow] = await db
    .select()
    .from(testRuns)
    .where(eq(testRuns.id, runId))
    .limit(1);

  if (!runRow) return null;

  const run = mapRunRow(runRow);
  const [results, securityAudit] = await Promise.all([
    fetchResultsForRun(run.id),
    fetchSecurityAuditForRun(run.id),
  ]);

  const [prevRow] = await db
    .select()
    .from(testRuns)
    .where(and(eq(testRuns.runType, run.runType), lt(testRuns.id, run.id)))
    .orderBy(desc(testRuns.id))
    .limit(1);

  const previousRun = prevRow ? mapRunRow(prevRow) : null;
  const comparison = await buildComparison(run, previousRun, results);

  return {
    run,
    results,
    securityAudit,
    comparison,
  };
}

export async function listSecurityFindings(filters?: {
  severity?: SecuritySeverity;
  status?: SecurityFindingStatus;
  auditId?: number;
  limit?: number;
}): Promise<SecurityFindingRecord[]> {
  let targetAuditId = filters?.auditId;

  if (!targetAuditId) {
    const [latestAudit] = await db
      .select({ id: securityAudits.id })
      .from(securityAudits)
      .orderBy(desc(securityAudits.createdAt), desc(securityAudits.id))
      .limit(1);
    if (!latestAudit) return [];
    targetAuditId = latestAudit.id;
  }

  const conditions = [eq(securityFindings.auditId, targetAuditId)];
  if (filters?.severity) {
    conditions.push(eq(securityFindings.severity, filters.severity));
  }
  if (filters?.status) {
    conditions.push(eq(securityFindings.status, filters.status));
  }

  const rows = await db
    .select({
      finding: securityFindings,
      runId: securityAudits.runId,
    })
    .from(securityFindings)
    .innerJoin(securityAudits, eq(securityFindings.auditId, securityAudits.id))
    .where(and(...conditions))
    .orderBy(securityFindings.findingCode)
    .limit(Math.min(Math.max(filters?.limit ?? 100, 1), 200));

  return rows.map((row) => mapFindingRow(row.finding, row.runId));
}

export async function getQaOverview(activeState: {
  isRunInProgress: boolean;
  activeRunType: QaRunType | null;
}): Promise<QaOverviewResponse> {
  const [runCountRow, caseRows, recentRunRows, latestAuditRow] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(testRuns),
    db.select({ enabled: testCases.enabled }).from(testCases),
    db
      .select()
      .from(testRuns)
      .orderBy(desc(testRuns.startedAt), desc(testRuns.id))
      .limit(20),
    db
      .select()
      .from(securityAudits)
      .orderBy(desc(securityAudits.createdAt), desc(securityAudits.id))
      .limit(1),
  ]);

  const recentRuns = recentRunRows.map(mapRunRow);
  const latestRun = recentRuns[0] ?? null;

  let previousRun: QaTestRunSummary | null = null;
  if (latestRun) {
    previousRun =
      recentRuns.find((r) => r.id !== latestRun.id && r.runType === latestRun.runType) ??
      recentRuns[1] ??
      null;
  }

  const comparison = latestRun ? await buildComparison(latestRun, previousRun) : null;

  let latestSecurityAudit: SecurityAuditRecord | null = null;
  const openFindingsBySeverity: Record<SecuritySeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  if (latestAuditRow[0]) {
    const audit = latestAuditRow[0];
    const findingRows = await db
      .select()
      .from(securityFindings)
      .where(eq(securityFindings.auditId, audit.id))
      .orderBy(securityFindings.findingCode);

    const mappedFindings = findingRows.map((row) => mapFindingRow(row, audit.runId));
    for (const f of mappedFindings) {
      if (f.status === 'open') {
        openFindingsBySeverity[f.severity] = (openFindingsBySeverity[f.severity] || 0) + 1;
      }
    }

    latestSecurityAudit = {
      id: audit.id,
      runId: audit.runId,
      auditType: audit.auditType,
      overallStatus: audit.overallStatus as SecurityAuditOverallStatus,
      createdAt: audit.createdAt.toISOString(),
      findings: mappedFindings,
    };
  }

  const enabledTestCases = caseRows.filter((c) => c.enabled).length;

  return {
    totalRuns: runCountRow[0]?.count ?? 0,
    totalTestCases: caseRows.length,
    enabledTestCases,
    isRunInProgress: activeState.isRunInProgress,
    activeRunType: activeState.activeRunType,
    latestRun,
    previousRun,
    comparison,
    latestSecurityAudit,
    openFindingsBySeverity,
    recentRuns,
  };
}

/**
 * Helper used strictly by isolated integration/IDOR tests to clean up synthetic test users
 * (with UIDs prefixed `qa-isolated-`) without ever touching production records.
 */
export async function deleteSyntheticQaUsers(uids: string[]): Promise<void> {
  const safeUids = uids.filter((uid) => uid.startsWith('qa-isolated-'));
  if (safeUids.length === 0) return;
  const { users } = await import('./schema.ts');
  await db.delete(users).where(inArray(users.uid, safeUids));
}
