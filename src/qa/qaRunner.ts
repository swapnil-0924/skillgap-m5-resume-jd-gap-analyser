import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import {
  completeTestRun,
  createSecurityAuditWithFindings,
  createTestRun,
  getTestRunDetail,
  isDatabaseConfigured,
  markTestRunCrashed,
  recordTestResults,
  sanitizeExecutionDetails,
  syncTestCaseCatalog,
  type SecurityFindingInsertInput,
  type TestResultInsertInput,
} from '../db/qaRepository.ts';
import type {
  QaRunDetailResponse,
  QaRunOverallStatus,
  QaRunType,
  QaTestResultRecord,
  SecurityAuditOverallStatus,
  SecurityAuditRecord,
} from '../types/qa.ts';
import { writeAuditReportsToDisk } from './reportGenerator.ts';
import {
  getTestDefinitionsForRunType,
  QA_TEST_CATALOG,
  type QaExecutionContext,
} from './testCatalog.ts';

const execFileAsync = promisify(execFile);

let activeRunInProgress = false;
let activeRunType: QaRunType | null = null;

export function getActiveRunState(): {
  isRunInProgress: boolean;
  activeRunType: QaRunType | null;
} {
  return {
    isRunInProgress: activeRunInProgress,
    activeRunType,
  };
}

export class QaRunInProgressError extends Error {
  constructor(runType: QaRunType) {
    super(`A QA test run (${runType}) is already in progress. Wait for it to finish before starting another.`);
    this.name = 'QaRunInProgressError';
  }
}

async function getAppVersionAndCommit(): Promise<{
  applicationVersion: string;
  commitHash: string | null;
}> {
  let applicationVersion = '1.0.0-m5';
  try {
    const pkgRaw = await readFile(path.resolve(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw) as { version?: string };
    if (pkg.version && pkg.version !== '0.0.0') {
      applicationVersion = pkg.version;
    }
  } catch {
    // Fallback to default version string
  }

  let commitHash: string | null = null;
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: process.cwd(),
      timeout: 3000,
    });
    commitHash = stdout.trim() || null;
  } catch {
    commitHash = null;
  }

  return { applicationVersion, commitHash };
}

async function checkServerReachable(baseUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function deriveOverallStatus(counts: {
  totalTests: number;
  passed: number;
  failed: number;
  blocked: number;
}): QaRunOverallStatus {
  if (counts.failed > 0) return 'failed';
  if (counts.blocked > 0) return 'partial';
  return 'passed';
}

function deriveSecurityAuditStatus(
  findings: SecurityFindingInsertInput[]
): SecurityAuditOverallStatus {
  if (findings.some((f) => f.status === 'open')) {
    return 'findings_open';
  }
  if (findings.some((f) => f.status === 'blocked')) {
    return 'blocked';
  }
  return 'passed';
}

export interface RunQaSuiteOptions {
  runType: QaRunType;
  baseUrl?: string;
  persistToDatabase?: boolean;
  writeAuditFiles?: boolean;
}

export interface RunQaSuiteOutput {
  detail: QaRunDetailResponse;
  persistedToDatabase: boolean;
  auditFilesWritten: {
    testReportPath: string;
    testJsonPath: string;
    securityReportPath: string | null;
  } | null;
}

export async function runQaSuite(options: RunQaSuiteOptions): Promise<RunQaSuiteOutput> {
  if (activeRunInProgress) {
    throw new QaRunInProgressError(activeRunType || 'all');
  }

  activeRunInProgress = true;
  activeRunType = options.runType;

  const port = Number(process.env.PORT) || 3000;
  const baseUrl = (options.baseUrl || `http://127.0.0.1:${port}`).replace(/\/+$/, '');
  const dbConfigured = isDatabaseConfigured();
  const shouldPersist = (options.persistToDatabase ?? true) && dbConfigured;

  let persistedRunId: number | null = null;
  const startedAt = new Date();
  const counts = { totalTests: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 };

  try {
    const [{ applicationVersion, commitHash }, serverReachable] = await Promise.all([
      getAppVersionAndCommit(),
      checkServerReachable(baseUrl),
    ]);

    const definitions = getTestDefinitionsForRunType(options.runType);
    counts.totalTests = definitions.length;

    let caseIdMap = new Map<string, number>();
    if (shouldPersist) {
      caseIdMap = await syncTestCaseCatalog(
        QA_TEST_CATALOG.map((t) => ({
          testName: t.testName,
          category: t.category,
          description: t.description,
          enabled: t.enabled,
        }))
      );
      const created = await createTestRun({
        runType: options.runType,
        applicationVersion,
        commitHash,
      });
      persistedRunId = created.id;
    }

    const ctx: QaExecutionContext = {
      baseUrl,
      serverReachable,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      dbConfigured,
    };

    const resultInsertInputs: TestResultInsertInput[] = [];
    const memoryResults: QaTestResultRecord[] = [];
    const securityFindingsList: SecurityFindingInsertInput[] = [];

    for (let idx = 0; idx < definitions.length; idx++) {
      const def = definitions[idx];
      const testStart = Date.now();
      let status: 'passed' | 'failed' | 'blocked' | 'skipped' = 'failed';
      let errorSummary: string | null = null;
      let executionDetails: Record<string, unknown> | null = null;

      try {
        const outcome = await def.execute(ctx);
        status = outcome.status;
        errorSummary = outcome.errorSummary ?? null;
        executionDetails = sanitizeExecutionDetails(outcome.executionDetails);
        if (outcome.securityFinding) {
          securityFindingsList.push(outcome.securityFinding);
        }
      } catch (err: unknown) {
        status = 'failed';
        errorSummary =
          err instanceof Error
            ? `Unhandled exception: ${err.message}`
            : `Unhandled exception: ${String(err)}`;
        executionDetails = { unhandledException: true };
      }

      const durationMs = Math.max(0, Date.now() - testStart);
      if (status === 'passed') counts.passed += 1;
      else if (status === 'failed') counts.failed += 1;
      else if (status === 'blocked') counts.blocked += 1;
      else counts.skipped += 1;

      const testCaseId = caseIdMap.get(def.testName) ?? idx + 1;
      resultInsertInputs.push({
        testCaseId,
        status,
        durationMs,
        errorSummary,
        executionDetails,
      });

      memoryResults.push({
        id: idx + 1,
        runId: persistedRunId ?? 0,
        testCaseId,
        testName: def.testName,
        category: def.category,
        description: def.description,
        status,
        durationMs,
        errorSummary,
        executionDetails,
        createdAt: new Date().toISOString(),
      });
    }

    const overallStatus = deriveOverallStatus(counts);
    let detail: QaRunDetailResponse;

    if (shouldPersist && persistedRunId !== null) {
      await recordTestResults(persistedRunId, resultInsertInputs);
      if (securityFindingsList.length > 0) {
        await createSecurityAuditWithFindings({
          runId: persistedRunId,
          auditType: options.runType === 'security' ? 'security_suite' : 'full_suite_security_audit',
          overallStatus: deriveSecurityAuditStatus(securityFindingsList),
          findings: securityFindingsList,
        });
      }
      await completeTestRun(persistedRunId, {
        ...counts,
        overallStatus,
      });
      const dbDetail = await getTestRunDetail(persistedRunId);
      if (!dbDetail) {
        throw new Error(`Failed to reload completed test run #${persistedRunId}.`);
      }
      detail = dbDetail;
    } else {
      const completedAt = new Date();
      const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
      const executed = counts.passed + counts.failed;
      const passPercentage =
        executed > 0
          ? Math.round((counts.passed / executed) * 1000) / 10
          : counts.totalTests > 0
            ? Math.round((counts.passed / counts.totalTests) * 1000) / 10
            : 0;

      const securityAudit: SecurityAuditRecord | null =
        securityFindingsList.length > 0
          ? {
              id: 0,
              runId: 0,
              auditType: options.runType === 'security' ? 'security_suite' : 'full_suite_security_audit',
              overallStatus: deriveSecurityAuditStatus(securityFindingsList),
              createdAt: completedAt.toISOString(),
              findings: securityFindingsList.map((f, i) => ({
                id: i + 1,
                auditId: 0,
                runId: 0,
                findingCode: f.findingCode,
                title: f.title,
                severity: f.severity,
                status: f.status,
                description: f.description,
                remediation: f.remediation,
                verifiedAt: f.verifiedAt ? f.verifiedAt.toISOString() : null,
              })),
            }
          : null;

      detail = {
        run: {
          id: 0,
          runType: options.runType,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          durationMs,
          ...counts,
          passPercentage,
          overallStatus,
          applicationVersion,
          commitHash,
        },
        results: memoryResults,
        securityAudit,
        comparison: null,
      };
    }

    let auditFilesWritten: RunQaSuiteOutput['auditFilesWritten'] = null;
    if (options.writeAuditFiles ?? true) {
      auditFilesWritten = await writeAuditReportsToDisk(detail);
    }

    return {
      detail,
      persistedToDatabase: shouldPersist && persistedRunId !== null,
      auditFilesWritten,
    };
  } catch (fatalError) {
    if (shouldPersist && persistedRunId !== null) {
      await markTestRunCrashed(persistedRunId, counts).catch(() => undefined);
    }
    throw fatalError;
  } finally {
    activeRunInProgress = false;
    activeRunType = null;
  }
}
