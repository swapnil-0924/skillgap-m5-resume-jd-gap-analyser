import type {
  QaAccessResponse,
  QaOverviewResponse,
  QaRunDetailResponse,
  QaRunOverallStatus,
  QaRunType,
  QaTestRunSummary,
  SecurityFindingRecord,
  SecurityFindingStatus,
  SecuritySeverity,
} from '../types/qa';
import { ApiError } from './api';
import { buildApiUrl } from './apiConfig';

async function qaFetchJson<T>(
  path: string,
  options: {
    method?: string;
    token: string | null;
    body?: unknown;
    timeoutMs?: number;
  }
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 25_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const res = await fetch(buildApiUrl(path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!res.ok) {
      const msg =
        parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error?: unknown }).error === 'string'
          ? (parsed as { error: string }).error
          : `Request failed with status ${res.status}.`;
      throw new ApiError(msg, { status: res.status });
    }

    return parsed as T;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new ApiError(
        `QA request timed out after ${Math.round(timeoutMs / 1000)}s.`,
        { isTimeout: true }
      );
    }
    throw new ApiError('Unable to reach the QA server. Check your connection and retry.', {
      isNetworkError: true,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function fetchQaAccess(token: string | null): Promise<QaAccessResponse> {
  return qaFetchJson<QaAccessResponse>('/api/qa/access', { token, timeoutMs: 12_000 });
}

export function fetchQaOverview(token: string): Promise<QaOverviewResponse> {
  return qaFetchJson<QaOverviewResponse>('/api/qa/overview', { token });
}

export function fetchQaRuns(
  token: string,
  filters?: {
    runType?: QaRunType | '';
    status?: QaRunOverallStatus | '';
    from?: string;
    to?: string;
  }
): Promise<{ runs: QaTestRunSummary[] }> {
  const params = new URLSearchParams();
  if (filters?.runType) params.set('runType', filters.runType);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const qs = params.toString();
  return qaFetchJson<{ runs: QaTestRunSummary[] }>(
    `/api/qa/runs${qs ? `?${qs}` : ''}`,
    { token }
  );
}

export function fetchQaRunDetail(runId: number, token: string): Promise<QaRunDetailResponse> {
  return qaFetchJson<QaRunDetailResponse>(`/api/qa/runs/${runId}`, { token });
}

export function fetchSecurityFindings(
  token: string,
  filters?: {
    severity?: SecuritySeverity | '';
    status?: SecurityFindingStatus | '';
    auditId?: number;
  }
): Promise<{ findings: SecurityFindingRecord[] }> {
  const params = new URLSearchParams();
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.auditId) params.set('auditId', String(filters.auditId));
  const qs = params.toString();
  return qaFetchJson<{ findings: SecurityFindingRecord[] }>(
    `/api/qa/findings${qs ? `?${qs}` : ''}`,
    { token }
  );
}

export function triggerQaRun(runType: QaRunType, token: string): Promise<QaRunDetailResponse> {
  return qaFetchJson<QaRunDetailResponse>('/api/qa/run', {
    method: 'POST',
    token,
    body: { runType },
    timeoutMs: 180_000,
  });
}

export async function downloadQaReport(params: {
  runId: number;
  format: 'test-md' | 'test-json' | 'security-md';
  token: string;
}): Promise<void> {
  const res = await fetch(
    buildApiUrl(`/api/qa/runs/${params.runId}/export?format=${params.format}`),
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${params.token}` },
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new ApiError(errText || `Export failed with status ${res.status}.`, {
      status: res.status,
    });
  }
  const blob = await res.blob();
  const ext = params.format === 'test-json' ? 'json' : 'md';
  const prefix = params.format === 'security-md' ? 'm5-security-audit' : 'm5-test-report';
  const filename = `${prefix}-run-${params.runId}.${ext}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
