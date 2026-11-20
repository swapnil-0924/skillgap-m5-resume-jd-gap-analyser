import type {
  AnalysisHistoryItem,
  AnalysisReport,
  QuickScanResult,
} from '../types/analysis';
import { buildApiUrl } from './apiConfig';
import { readAnalysisNdjsonStream } from './ndjsonStream';
import {
  validateAnalysisReport,
  validateCoachResponse,
  validateHistoryResponse,
  validateQuickScanResult,
} from './responseValidators';

export const API_TIMEOUTS_MS = {
  standard: 20_000,
  quickAi: 35_000,
  streamTotal: 120_000,
  streamIdle: 45_000,
} as const;

export class ApiError extends Error {
  readonly status?: number;
  readonly isTimeout: boolean;
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    options?: { status?: number; isTimeout?: boolean; isNetworkError?: boolean }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status;
    this.isTimeout = Boolean(options?.isTimeout);
    this.isNetworkError = Boolean(options?.isNetworkError);
  }
}

function defaultHttpErrorMessage(status: number): string {
  if (status === 400) return 'The request could not be processed. Please review your inputs and try again.';
  if (status === 401) return 'Your session has expired or is unauthorized. Please sign in again.';
  if (status === 403) return 'You do not have permission to access this resource.';
  if (status === 404) return 'The requested resource could not be found.';
  if (status === 413) return 'The uploaded document exceeds the maximum allowed file size.';
  if (status === 429) return 'Too many requests right now. Please wait a moment and try again.';
  if (status >= 500) return `The server encountered an error (${status}). Please try again shortly.`;
  return `Request failed with status ${status}.`;
}

async function parseResponse<T>(
  res: Response,
  validate?: (raw: unknown) => T
): Promise<T> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    throw new ApiError('Failed to read the server response. Please try again.', {
      status: res.status,
      isNetworkError: true,
    });
  }

  let data: unknown = null;
  let parsedOk = false;
  if (text) {
    try {
      data = JSON.parse(text);
      parsedOk = true;
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const serverError =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error.trim()
        : '';
    throw new ApiError(serverError || defaultHttpErrorMessage(res.status), {
      status: res.status,
    });
  }

  if (text && !parsedOk) {
    throw new ApiError(
      'Received an unexpected non-JSON response from the server. Check your API configuration and try again.',
      { status: res.status }
    );
  }

  return validate ? validate(data) : (data as T);
}

function buildAuthHeaders(token: string | null, extra?: Record<string, string>) {
  const headers: Record<string, string> = { ...(extra || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

interface FetchWithTimeoutOptions {
  method: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * Wraps fetch with an automatic AbortController timeout while preserving
 * explicit caller cancellation (AbortError) and translating network failures.
 */
async function fetchWithTimeout(
  path: string,
  options: FetchWithTimeoutOptions
): Promise<{ response: Response; cleanup: () => void; effectiveSignal: AbortSignal }> {
  const controller = new AbortController();
  let timedOut = false;

  const onCallerAbort = () => {
    controller.abort(options.signal?.reason);
  };

  if (options.signal) {
    if (options.signal.aborted) {
      const abortErr = new Error('Request was cancelled.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    options.signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);

  const cleanup = () => {
    clearTimeout(timer);
    if (options.signal) {
      options.signal.removeEventListener('abort', onCallerAbort);
    }
  };

  try {
    const response = await fetch(buildApiUrl(path), {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    return { response, cleanup, effectiveSignal: controller.signal };
  } catch (error: unknown) {
    cleanup();
    if (timedOut) {
      const seconds = Math.round(options.timeoutMs / 1000);
      throw new ApiError(
        `Request timed out after ${seconds}s. Please check your connection and try again.`,
        { isTimeout: true }
      );
    }
    if ((error as { name?: string })?.name === 'AbortError' || options.signal?.aborted) {
      const abortErr = new Error('Request was cancelled.');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    throw new ApiError(
      'Unable to reach the analysis server. Please check your network connection and try again.',
      { isNetworkError: true }
    );
  }
}

export async function runGapAnalysis(params: {
  resumeFile: File;
  jdText?: string;
  jdFile?: File | null;
  token: string | null;
  onProgress?: (stepIndex: number, message: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<AnalysisReport> {
  const formData = new FormData();
  formData.append('resume', params.resumeFile);
  if (params.jdFile) {
    formData.append('jdFile', params.jdFile);
  } else if (params.jdText) {
    formData.append('jdText', params.jdText);
  }

  const totalTimeoutMs = params.timeoutMs ?? API_TIMEOUTS_MS.streamTotal;
  const { response: res, cleanup, effectiveSignal } = await fetchWithTimeout('/api/analyze-stream', {
    method: 'POST',
    headers: buildAuthHeaders(params.token),
    body: formData,
    timeoutMs: totalTimeoutMs,
    signal: params.signal,
  });

  try {
    if (!res.ok) {
      return await parseResponse<AnalysisReport>(res, validateAnalysisReport);
    }

    if (!res.body) {
      throw new ApiError('Streaming response unavailable. Please try again.', {
        status: res.status,
      });
    }

    return await readAnalysisNdjsonStream(res.body, {
      onProgress: params.onProgress,
      validateReport: validateAnalysisReport,
      idleTimeoutMs: API_TIMEOUTS_MS.streamIdle,
      signal: effectiveSignal,
    });
  } catch (error: unknown) {
    // Distinguish overall timeout abort from user-triggered cancel.
    if (
      (error as { name?: string })?.name === 'AbortError' &&
      !params.signal?.aborted
    ) {
      const seconds = Math.round(totalTimeoutMs / 1000);
      throw new ApiError(
        `Analysis timed out after ${seconds}s. Try a smaller PDF or retry shortly.`,
        { isTimeout: true }
      );
    }
    throw error;
  } finally {
    cleanup();
  }
}

export async function quickScanJd(params: {
  jdText?: string;
  jdFile?: File | null;
  signal?: AbortSignal;
}): Promise<QuickScanResult> {
  const formData = new FormData();
  if (params.jdFile) {
    formData.append('jdFile', params.jdFile);
  } else if (params.jdText) {
    formData.append('jdText', params.jdText);
  }

  const { response, cleanup } = await fetchWithTimeout('/api/jd/quick-scan', {
    method: 'POST',
    body: formData,
    timeoutMs: API_TIMEOUTS_MS.quickAi,
    signal: params.signal,
  });

  try {
    return await parseResponse<QuickScanResult>(response, validateQuickScanResult);
  } finally {
    cleanup();
  }
}

export async function saveSessionAnalysis(
  report: AnalysisReport,
  token: string,
  signal?: AbortSignal
): Promise<AnalysisReport> {
  const { response, cleanup } = await fetchWithTimeout('/api/analyses/save', {
    method: 'POST',
    headers: buildAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(report),
    timeoutMs: API_TIMEOUTS_MS.standard,
    signal,
  });

  try {
    return await parseResponse<AnalysisReport>(response, validateAnalysisReport);
  } finally {
    cleanup();
  }
}

export async function fetchAnalysisHistory(
  token: string,
  signal?: AbortSignal
): Promise<AnalysisHistoryItem[]> {
  const { response, cleanup } = await fetchWithTimeout('/api/analyses', {
    method: 'GET',
    headers: buildAuthHeaders(token),
    timeoutMs: API_TIMEOUTS_MS.standard,
    signal,
  });

  try {
    return await parseResponse<AnalysisHistoryItem[]>(response, validateHistoryResponse);
  } finally {
    cleanup();
  }
}

export async function fetchAnalysisById(
  id: number,
  token: string,
  signal?: AbortSignal
): Promise<AnalysisReport> {
  const { response, cleanup } = await fetchWithTimeout(`/api/analyses/${id}`, {
    method: 'GET',
    headers: buildAuthHeaders(token),
    timeoutMs: API_TIMEOUTS_MS.standard,
    signal,
  });

  try {
    return await parseResponse<AnalysisReport>(response, validateAnalysisReport);
  } finally {
    cleanup();
  }
}

export async function updateRoadmapProgress(
  id: number,
  completedDays: number[],
  token: string,
  signal?: AbortSignal
): Promise<AnalysisReport> {
  const { response, cleanup } = await fetchWithTimeout(`/api/analyses/${id}/progress`, {
    method: 'PATCH',
    headers: buildAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ completedDays }),
    timeoutMs: API_TIMEOUTS_MS.standard,
    signal,
  });

  try {
    return await parseResponse<AnalysisReport>(response, validateAnalysisReport);
  } finally {
    cleanup();
  }
}

export async function deleteAnalysisById(
  id: number,
  token: string,
  signal?: AbortSignal
): Promise<void> {
  const { response, cleanup } = await fetchWithTimeout(`/api/analyses/${id}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
    timeoutMs: API_TIMEOUTS_MS.standard,
    signal,
  });

  try {
    await parseResponse<{ deleted: boolean }>(response);
  } finally {
    cleanup();
  }
}

export async function askGapCoach(params: {
  question: string;
  report: AnalysisReport;
  signal?: AbortSignal;
}): Promise<{ answer: string; latencyMs: number }> {
  const { response, cleanup } = await fetchWithTimeout('/api/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: params.question,
      report: {
        jobTitle: params.report.jobTitle,
        compatibilityScore: params.report.compatibilityScore,
        matchedSkills: params.report.matchedSkills,
        partialSkills: params.report.partialSkills,
        missingSkills: params.report.missingSkills,
      },
    }),
    timeoutMs: API_TIMEOUTS_MS.quickAi,
    signal: params.signal,
  });

  try {
    return await parseResponse<{ answer: string; latencyMs: number }>(
      response,
      validateCoachResponse
    );
  } finally {
    cleanup();
  }
}
