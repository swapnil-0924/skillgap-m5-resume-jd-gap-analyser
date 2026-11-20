import type {
  AnalysisHistoryItem,
  AnalysisReport,
  QuickScanResult,
} from '../types/analysis';

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const errorMsg =
      (data as { error?: string } | null)?.error ||
      `Request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }
  return data as T;
}

function buildAuthHeaders(token: string | null, extra?: Record<string, string>) {
  const headers: Record<string, string> = { ...(extra || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function runGapAnalysis(params: {
  resumeFile: File;
  jdText?: string;
  jdFile?: File | null;
  token: string | null;
  onProgress?: (stepIndex: number, message: string) => void;
  signal?: AbortSignal;
}): Promise<AnalysisReport> {
  const formData = new FormData();
  formData.append('resume', params.resumeFile);
  if (params.jdFile) {
    formData.append('jdFile', params.jdFile);
  } else if (params.jdText) {
    formData.append('jdText', params.jdText);
  }

  const res = await fetch('/api/analyze-stream', {
    method: 'POST',
    headers: buildAuthHeaders(params.token),
    body: formData,
    signal: params.signal,
  });

  if (!res.ok) {
    return parseResponse<AnalysisReport>(res);
  }

  if (!res.body) {
    throw new Error('Streaming response unavailable. Please try again.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalReport: AnalysisReport | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        const evt = JSON.parse(line) as
          | { type: 'progress'; step: number; message: string }
          | { type: 'result'; data: AnalysisReport }
          | { type: 'error'; error: string };
        if (evt.type === 'progress') {
          params.onProgress?.(evt.step, evt.message);
        } else if (evt.type === 'error') {
          throw new Error(evt.error || 'Analysis failed.');
        } else if (evt.type === 'result') {
          finalReport = evt.data;
        }
      }
      newlineIndex = buffer.indexOf('\n');
    }
  }

  if (buffer.trim()) {
    const evt = JSON.parse(buffer.trim()) as
      | { type: 'result'; data: AnalysisReport }
      | { type: 'error'; error: string };
    if (evt.type === 'error') {
      throw new Error(evt.error || 'Analysis failed.');
    }
    if (evt.type === 'result') {
      finalReport = evt.data;
    }
  }

  if (!finalReport) {
    throw new Error('Analysis ended unexpectedly without returning a report. Please try again.');
  }

  return finalReport;
}

export async function quickScanJd(params: {
  jdText?: string;
  jdFile?: File | null;
}): Promise<QuickScanResult> {
  const formData = new FormData();
  if (params.jdFile) {
    formData.append('jdFile', params.jdFile);
  } else if (params.jdText) {
    formData.append('jdText', params.jdText);
  }

  const res = await fetch('/api/jd/quick-scan', {
    method: 'POST',
    body: formData,
  });
  return parseResponse<QuickScanResult>(res);
}

export async function saveSessionAnalysis(
  report: AnalysisReport,
  token: string
): Promise<AnalysisReport> {
  const res = await fetch('/api/analyses/save', {
    method: 'POST',
    headers: buildAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(report),
  });
  return parseResponse<AnalysisReport>(res);
}

export async function fetchAnalysisHistory(
  token: string
): Promise<AnalysisHistoryItem[]> {
  const res = await fetch('/api/analyses', {
    method: 'GET',
    headers: buildAuthHeaders(token),
  });
  const data = await parseResponse<{ analyses: AnalysisHistoryItem[] }>(res);
  return data.analyses || [];
}

export async function fetchAnalysisById(
  id: number,
  token: string
): Promise<AnalysisReport> {
  const res = await fetch(`/api/analyses/${id}`, {
    method: 'GET',
    headers: buildAuthHeaders(token),
  });
  return parseResponse<AnalysisReport>(res);
}

export async function updateRoadmapProgress(
  id: number,
  completedDays: number[],
  token: string
): Promise<AnalysisReport> {
  const res = await fetch(`/api/analyses/${id}/progress`, {
    method: 'PATCH',
    headers: buildAuthHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ completedDays }),
  });
  return parseResponse<AnalysisReport>(res);
}

export async function deleteAnalysisById(
  id: number,
  token: string
): Promise<void> {
  const res = await fetch(`/api/analyses/${id}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
  });
  await parseResponse<{ deleted: boolean }>(res);
}

export async function askGapCoach(params: {
  question: string;
  report: AnalysisReport;
}): Promise<{ answer: string; latencyMs: number }> {
  const res = await fetch('/api/coach', {
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
  });
  return parseResponse<{ answer: string; latencyMs: number }>(res);
}
