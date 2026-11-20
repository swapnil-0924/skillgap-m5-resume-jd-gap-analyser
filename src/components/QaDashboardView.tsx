import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileCode2,
  FileText,
  Lock,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type {
  QaAccessResponse,
  QaOverviewResponse,
  QaRunDetailResponse,
  QaRunOverallStatus,
  QaRunType,
  QaTestCategory,
  QaTestRunSummary,
  QaTestStatus,
  SecurityFindingRecord,
  SecurityFindingStatus,
  SecuritySeverity,
} from '../types/qa';
import {
  downloadQaReport,
  fetchQaAccess,
  fetchQaOverview,
  fetchQaRunDetail,
  fetchQaRuns,
  fetchSecurityFindings,
  triggerQaRun,
} from '../services/qaApi';

interface QaDashboardViewProps {
  isSignedIn: boolean;
  userEmail: string | null;
  getIdToken: () => Promise<string | null>;
  onSignIn: () => Promise<unknown>;
}

const SUITE_BUTTONS: Array<{ id: QaRunType; label: string }> = [
  { id: 'all', label: 'Run All Tests' },
  { id: 'unit', label: 'Unit' },
  { id: 'integration', label: 'Integration' },
  { id: 'api', label: 'API' },
  { id: 'e2e', label: 'E2E' },
  { id: 'security', label: 'Security Audit' },
  { id: 'ai_regression', label: 'AI Regression' },
];

const SEVERITY_ORDER: SecuritySeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusTextClass(status: QaTestStatus | QaRunOverallStatus | SecurityFindingStatus): string {
  switch (status) {
    case 'passed':
    case 'verified_secure':
    case 'mitigated':
      return 'text-[#15803D]';
    case 'failed':
    case 'crashed':
    case 'open':
      return 'text-[#B91C1C]';
    case 'blocked':
    case 'partial':
      return 'text-[#B45309]';
    default:
      return 'text-slate-500';
  }
}

function severityTextClass(severity: SecuritySeverity): string {
  switch (severity) {
    case 'critical':
      return 'text-[#991B1B] font-semibold';
    case 'high':
      return 'text-[#B91C1C] font-semibold';
    case 'medium':
      return 'text-[#B45309] font-medium';
    case 'low':
      return 'text-[#1D4ED8] font-medium';
    default:
      return 'text-slate-500';
  }
}

export function QaDashboardView({
  isSignedIn,
  userEmail,
  getIdToken,
  onSignIn,
}: QaDashboardViewProps) {
  const [access, setAccess] = useState<QaAccessResponse | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [overview, setOverview] = useState<QaOverviewResponse | null>(null);
  const [runs, setRuns] = useState<QaTestRunSummary[]>([]);
  const [findings, setFindings] = useState<SecurityFindingRecord[]>([]);
  const [selectedRunDetail, setSelectedRunDetail] = useState<QaRunDetailResponse | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<SecurityFindingRecord | null>(null);

  const [loadingData, setLoadingData] = useState(false);
  const [loadingRunDetail, setLoadingRunDetail] = useState(false);
  const [runningSuite, setRunningSuite] = useState<QaRunType | null>(null);
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterRunType, setFilterRunType] = useState<QaRunType | ''>('');
  const [filterStatus, setFilterStatus] = useState<QaRunOverallStatus | ''>('');
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<SecuritySeverity | ''>('');
  const [filterResultCategory, setFilterResultCategory] = useState<QaTestCategory | ''>('');
  const [filterResultStatus, setFilterResultStatus] = useState<QaTestStatus | ''>('');

  const loadDashboardData = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) return;

      const [ov, runsRes, findingsRes] = await Promise.all([
        fetchQaOverview(token),
        fetchQaRuns(token, {
          runType: filterRunType,
          status: filterStatus,
          from: filterFromDate ? new Date(`${filterFromDate}T00:00:00Z`).toISOString() : undefined,
        }),
        fetchSecurityFindings(token, {
          severity: filterSeverity,
        }),
      ]);

      setOverview(ov);
      setRuns(runsRes.runs);
      setFindings(findingsRes.findings);

      if (findingsRes.findings.length > 0) {
        setSelectedFinding((prev) =>
          prev && findingsRes.findings.some((f) => f.id === prev.id)
            ? prev
            : findingsRes.findings[0]
        );
      } else {
        setSelectedFinding(null);
      }

      const targetRunId = ov.latestRun?.id ?? runsRes.runs[0]?.id ?? null;
      if (targetRunId) {
        const detail = await fetchQaRunDetail(targetRunId, token);
        setSelectedRunDetail(detail);
      } else {
        setSelectedRunDetail(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load QA dashboard data.');
    } finally {
      setLoadingData(false);
    }
  }, [getIdToken, filterRunType, filterStatus, filterFromDate, filterSeverity]);

  useEffect(() => {
    let active = true;
    const verifyAccess = async () => {
      setAccessLoading(true);
      setError(null);
      try {
        const token = isSignedIn ? await getIdToken() : null;
        const result = await fetchQaAccess(token);
        if (active) {
          setAccess(result);
        }
      } catch (err: unknown) {
        if (active) {
          setAccess({ authenticated: false, isAdmin: false, email: userEmail });
          setError(err instanceof Error ? err.message : 'Failed to verify administrator access.');
        }
      } finally {
        if (active) setAccessLoading(false);
      }
    };
    verifyAccess();
    return () => {
      active = false;
    };
  }, [isSignedIn, userEmail, getIdToken]);

  useEffect(() => {
    if (access?.isAdmin) {
      loadDashboardData();
    }
  }, [access?.isAdmin, loadDashboardData]);

  const handleSelectRun = async (runId: number) => {
    setLoadingRunDetail(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) return;
      const detail = await fetchQaRunDetail(runId, token);
      setSelectedRunDetail(detail);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load test run details.');
    } finally {
      setLoadingRunDetail(false);
    }
  };

  const handleTriggerRun = async (runType: QaRunType) => {
    setRunningSuite(runType);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        setError('Please sign in with an authorized administrator account first.');
        return;
      }
      const detail = await triggerQaRun(runType, token);
      setSelectedRunDetail(detail);
      await loadDashboardData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Test suite execution failed.');
    } finally {
      setRunningSuite(null);
    }
  };

  const handleExport = async (format: 'test-md' | 'test-json' | 'security-md') => {
    const runId = selectedRunDetail?.run.id ?? overview?.latestRun?.id;
    if (!runId) return;
    setExportingFormat(format);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) return;
      await downloadQaReport({ runId, format, token });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to export report.');
    } finally {
      setExportingFormat(null);
    }
  };

  const filteredRunResults = useMemo(() => {
    if (!selectedRunDetail) return [];
    return selectedRunDetail.results.filter((r) => {
      if (filterResultCategory && r.category !== filterResultCategory) return false;
      if (filterResultStatus && r.status !== filterResultStatus) return false;
      return true;
    });
  }, [selectedRunDetail, filterResultCategory, filterResultStatus]);

  const totalOpenFindings = useMemo(() => {
    if (!overview) return 0;
    return SEVERITY_ORDER.reduce(
      (sum, sev) => sum + (overview.openFindingsBySeverity[sev] || 0),
      0
    );
  }, [overview]);

  if (accessLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#1D4ED8]" />
        <p className="text-sm text-slate-600">Verifying QA administrator permissions…</p>
      </div>
    );
  }

  if (!access?.isAdmin) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-8 max-w-2xl">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700 shrink-0">
            <Lock className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            <h1 className="text-lg font-semibold text-slate-900">
              Administrator Access Required
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              The Permanent QA Testing & Security Audit Dashboard is restricted to authorized
              administrators so test execution, database telemetry, and security findings remain
              protected from public access.
            </p>
            {isSignedIn ? (
              <p className="text-xs text-slate-500">
                Signed in as <span className="font-mono text-slate-800">{userEmail}</span>.
                This account is not listed in <span className="font-mono">QA_ADMIN_EMAILS</span>.
              </p>
            ) : (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onSignIn}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#1D4ED8] hover:bg-[#1E40AF] rounded-lg transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  Sign in with Authorized Google Account
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  const latest = overview?.latestRun ?? null;
  const activeRunId = selectedRunDetail?.run.id ?? latest?.id ?? null;

  return (
    <div className="space-y-6">
      {/* Header + Controlled Test Execution Toolbar */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              QA Testing & Security Audit System
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Permanent PostgreSQL test history, automated security audit ledger, and isolated synthetic suite execution.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadDashboardData}
              disabled={loadingData || Boolean(runningSuite)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          </div>
        </div>

        {/* Controlled Suite Runner Bar */}
        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {SUITE_BUTTONS.map((btn) => {
              const isPrimary = btn.id === 'all';
              const isThisRunning = runningSuite === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  disabled={Boolean(runningSuite)}
                  onClick={() => handleTriggerRun(btn.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer ${
                    isPrimary
                      ? 'bg-[#1D4ED8] hover:bg-[#1E40AF] text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  <Play className="w-3 h-3" aria-hidden="true" />
                  {isThisRunning ? `Running ${btn.label}…` : btn.label}
                </button>
              );
            })}
          </div>

          {/* Export Controls */}
          {activeRunId && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={Boolean(exportingFormat)}
                onClick={() => handleExport('test-md')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                {exportingFormat === 'test-md' ? 'Exporting…' : 'Test Report (.md)'}
              </button>
              <button
                type="button"
                disabled={Boolean(exportingFormat)}
                onClick={() => handleExport('test-json')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" aria-hidden="true" />
                {exportingFormat === 'test-json' ? 'Exporting…' : 'Results (.json)'}
              </button>
              <button
                type="button"
                disabled={Boolean(exportingFormat)}
                onClick={() => handleExport('security-md')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                {exportingFormat === 'security-md' ? 'Exporting…' : 'Security Audit (.md)'}
              </button>
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center justify-between gap-3"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="underline font-medium shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
      </section>

      {/* Primary KPI Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Total Runs / Cases</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {overview?.totalRuns ?? 0}
            <span className="text-sm font-normal text-slate-400">
              {' '}
              / {overview?.totalTestCases ?? 0} cases
            </span>
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {overview?.enabledTestCases ?? 0} enabled in active catalog
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Latest Pass Rate (Executed)</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900">
              {latest ? `${latest.passPercentage}%` : '—'}
            </p>
            {overview?.comparison && (
              <span
                className={`text-xs font-mono tabular-nums ${
                  overview.comparison.passRateDelta >= 0 ? 'text-[#15803D]' : 'text-[#B91C1C]'
                }`}
              >
                {overview.comparison.passRateDelta >= 0 ? '+' : ''}
                {overview.comparison.passRateDelta}% vs #{overview.comparison.previousRunId}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
            {latest
              ? `${latest.passed} passed · ${latest.failed} failed · ${latest.blocked} blocked`
              : 'No runs recorded yet'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Latest Run Duration</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {latest ? formatDuration(latest.durationMs) : '—'}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {latest
              ? `Suite: ${latest.runType} · ${formatTimestamp(latest.startedAt)}`
              : 'Trigger a suite above'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Open Security Findings</p>
          <p className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900">
            {totalOpenFindings}
          </p>
          <p className="mt-1.5 text-xs font-mono tabular-nums text-slate-600">
            C:{overview?.openFindingsBySeverity.critical ?? 0} · H:
            {overview?.openFindingsBySeverity.high ?? 0} · M:
            {overview?.openFindingsBySeverity.medium ?? 0} · L:
            {overview?.openFindingsBySeverity.low ?? 0}
          </p>
        </div>
      </section>

      {/* Previous vs Latest Run Comparison + Latest Security Audit Summary */}
      {(overview?.comparison || overview?.latestSecurityAudit) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Latest vs Previous Run Comparison
            </h2>
            {overview?.comparison ? (
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex flex-wrap gap-4 font-mono tabular-nums">
                  <span>
                    Run #{overview.comparison.latestRunId} vs #{overview.comparison.previousRunId}
                  </span>
                  <span>
                    Passed: {overview.comparison.passedDelta >= 0 ? '+' : ''}
                    {overview.comparison.passedDelta}
                  </span>
                  <span>
                    Failed: {overview.comparison.failedDelta >= 0 ? '+' : ''}
                    {overview.comparison.failedDelta}
                  </span>
                  <span>
                    Duration: {overview.comparison.durationDeltaMs >= 0 ? '+' : ''}
                    {formatDuration(Math.abs(overview.comparison.durationDeltaMs))}
                  </span>
                </div>
                <p>
                  <span className="font-medium text-slate-800">Regressions: </span>
                  {overview.comparison.regressions.length > 0
                    ? overview.comparison.regressions.join(', ')
                    : 'None'}
                </p>
                <p>
                  <span className="font-medium text-slate-800">Improvements: </span>
                  {overview.comparison.improvements.length > 0
                    ? overview.comparison.improvements.join(', ')
                    : 'None'}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Execute at least two runs of the same suite type to compute deltas, regressions, and improvements.
              </p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Latest Security Audit</h2>
              {overview?.latestSecurityAudit && (
                <span className="text-xs font-mono text-slate-500">
                  Audit #{overview.latestSecurityAudit.id} ·{' '}
                  {formatTimestamp(overview.latestSecurityAudit.createdAt)}
                </span>
              )}
            </div>
            {overview?.latestSecurityAudit ? (
              <div className="space-y-2 text-xs text-slate-600">
                <p>
                  Status:{' '}
                  <span
                    className={`font-mono uppercase font-semibold ${
                      overview.latestSecurityAudit.overallStatus === 'passed'
                        ? 'text-[#15803D]'
                        : 'text-[#B91C1C]'
                    }`}
                  >
                    {overview.latestSecurityAudit.overallStatus}
                  </span>
                </p>
                <div className="grid grid-cols-5 gap-2 pt-1 font-mono tabular-nums">
                  {SEVERITY_ORDER.map((sev) => (
                    <div key={sev} className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <p className="text-[10px] uppercase text-slate-500">{sev}</p>
                      <p className={`text-sm mt-0.5 ${severityTextClass(sev)}`}>
                        {overview.openFindingsBySeverity[sev] ?? 0}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No security audit has been persisted yet. Click Security Audit or Run All Tests above.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Recent Test Runs Table + Filters */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Recent Test Runs</h2>
            <p className="text-xs text-slate-500">
              Select any run row to inspect individual test case results and execution details.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter runs by category"
              value={filterRunType}
              onChange={(e) => setFilterRunType(e.target.value as QaRunType | '')}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
            >
              <option value="">All Suites</option>
              <option value="all">all</option>
              <option value="unit">unit</option>
              <option value="integration">integration</option>
              <option value="api">api</option>
              <option value="e2e">e2e</option>
              <option value="security">security</option>
              <option value="ai_regression">ai_regression</option>
            </select>
            <select
              aria-label="Filter runs by status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as QaRunOverallStatus | '')}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
            >
              <option value="">All Statuses</option>
              <option value="passed">passed</option>
              <option value="failed">failed</option>
              <option value="partial">partial</option>
              <option value="crashed">crashed</option>
            </select>
            <input
              aria-label="Filter runs from date"
              type="date"
              value={filterFromDate}
              onChange={(e) => setFilterFromDate(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
            />
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No persisted test runs match the selected filters yet. Run a test suite above to record permanent results in PostgreSQL.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Run ID</th>
                  <th className="py-2.5 px-4 font-medium">Suite</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Pass %</th>
                  <th className="py-2.5 px-4 font-medium text-right">P / F / B / S</th>
                  <th className="py-2.5 px-4 font-medium text-right">Duration</th>
                  <th className="py-2.5 px-4 font-medium">Started</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {runs.map((run) => {
                  const selected = selectedRunDetail?.run.id === run.id;
                  return (
                    <tr
                      key={run.id}
                      onClick={() => handleSelectRun(run.id)}
                      className={`cursor-pointer transition-colors ${
                        selected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono tabular-nums font-medium text-slate-900">
                        #{run.id}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">{run.runType}</td>
                      <td className={`py-2.5 px-4 font-mono uppercase font-medium ${statusTextClass(run.overallStatus)}`}>
                        {run.overallStatus}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                        {run.passPercentage}%
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                        {run.passed}/{run.failed}/{run.blocked}/{run.skipped}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                        {formatDuration(run.durationMs)}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">
                        {formatTimestamp(run.startedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Selected Test Run Detail View */}
      {selectedRunDetail && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Test Run #{selectedRunDetail.run.id} Details ({selectedRunDetail.run.runType})
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                Version {selectedRunDetail.run.applicationVersion} · Commit{' '}
                {selectedRunDetail.run.commitHash || 'n/a'} · {filteredRunResults.length} shown
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter test results by category"
                value={filterResultCategory}
                onChange={(e) => setFilterResultCategory(e.target.value as QaTestCategory | '')}
                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
              >
                <option value="">All Categories</option>
                <option value="unit">unit</option>
                <option value="integration">integration</option>
                <option value="api">api</option>
                <option value="e2e">e2e</option>
                <option value="security">security</option>
                <option value="ai_regression">ai_regression</option>
              </select>
              <select
                aria-label="Filter test results by status"
                value={filterResultStatus}
                onChange={(e) => setFilterResultStatus(e.target.value as QaTestStatus | '')}
                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
              >
                <option value="">All Result Statuses</option>
                <option value="passed">passed</option>
                <option value="failed">failed</option>
                <option value="blocked">blocked</option>
                <option value="skipped">skipped</option>
              </select>
            </div>
          </div>

          {loadingRunDetail ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading run details…</div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredRunResults.map((res) => (
                <div key={res.id} className="p-4 hover:bg-slate-50/70 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {res.status === 'passed' && (
                        <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0" aria-hidden="true" />
                      )}
                      {res.status === 'failed' && (
                        <XCircle className="w-4 h-4 text-[#B91C1C] shrink-0" aria-hidden="true" />
                      )}
                      {res.status === 'blocked' && (
                        <AlertTriangle className="w-4 h-4 text-[#B45309] shrink-0" aria-hidden="true" />
                      )}
                      {res.status === 'skipped' && (
                        <Clock className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                      )}
                      <span className="text-xs font-mono font-medium text-slate-900 break-all">
                        {res.testName}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        [{res.category}]
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono tabular-nums text-xs shrink-0">
                      <span className={`uppercase font-medium ${statusTextClass(res.status)}`}>
                        {res.status}
                      </span>
                      <span className="text-slate-500">{formatDuration(res.durationMs)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 pl-6">{res.description}</p>
                  {res.errorSummary && (
                    <p className="text-xs text-[#B91C1C] pl-6 font-mono">{res.errorSummary}</p>
                  )}
                  {res.executionDetails && Object.keys(res.executionDetails).length > 0 && (
                    <p className="text-[11px] text-slate-500 pl-6 font-mono break-all">
                      {JSON.stringify(res.executionDetails)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Security Findings Ledger & Inspector */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-slate-700" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">Security Findings Ledger</h2>
            </div>
            <select
              aria-label="Filter security findings by severity"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value as SecuritySeverity | '')}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
            >
              <option value="">All Severities</option>
              {SEVERITY_ORDER.map((sev) => (
                <option key={sev} value={sev}>
                  {sev}
                </option>
              ))}
            </select>
          </div>

          {findings.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No security findings recorded for the selected severity filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Code</th>
                    <th className="py-2.5 px-4 font-medium">Finding</th>
                    <th className="py-2.5 px-4 font-medium">Severity</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {findings.map((finding) => {
                    const isSelected = selectedFinding?.id === finding.id;
                    return (
                      <tr
                        key={finding.id}
                        onClick={() => setSelectedFinding(finding)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                          {finding.findingCode}
                        </td>
                        <td className="py-2.5 px-4 text-slate-700">{finding.title}</td>
                        <td className={`py-2.5 px-4 font-mono uppercase ${severityTextClass(finding.severity)}`}>
                          {finding.severity}
                        </td>
                        <td className={`py-2.5 px-4 font-mono whitespace-nowrap ${statusTextClass(finding.status)}`}>
                          {finding.status}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Finding Detail Panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Finding Detail</h3>
          {selectedFinding ? (
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2 font-mono">
                <span className="font-semibold text-slate-900">{selectedFinding.findingCode}</span>
                <span className={`uppercase ${severityTextClass(selectedFinding.severity)}`}>
                  {selectedFinding.severity}
                </span>
              </div>
              <p className="font-medium text-slate-900 leading-snug">{selectedFinding.title}</p>
              <p className="text-slate-600">
                Status:{' '}
                <span className={`font-mono font-medium ${statusTextClass(selectedFinding.status)}`}>
                  {selectedFinding.status}
                </span>
              </p>
              <div className="pt-2 border-t border-slate-200 space-y-1">
                <p className="font-medium text-slate-800">Observed Evidence</p>
                <p className="text-slate-600 leading-relaxed">{selectedFinding.description}</p>
              </div>
              <div className="pt-2 border-t border-slate-200 space-y-1">
                <p className="font-medium text-slate-800">Remediation</p>
                <p className="text-slate-600 leading-relaxed">{selectedFinding.remediation}</p>
              </div>
              <p className="text-[11px] text-slate-500 pt-1 font-mono">
                Verified At: {formatTimestamp(selectedFinding.verifiedAt)}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Select a security finding from the ledger to inspect observed evidence and remediation guidance.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
