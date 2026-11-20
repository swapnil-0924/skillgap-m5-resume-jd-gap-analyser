import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApiUrl, normalizeApiBaseUrl } from './apiConfig.ts';
import { readAnalysisNdjsonStream, StreamParseError } from './ndjsonStream.ts';
import {
  validateAnalysisReport,
  validateCoachResponse,
  validateHistoryResponse,
  validateQuickScanResult,
} from './responseValidators.ts';
import { ApiError, fetchAnalysisHistory, runGapAnalysis } from './api.ts';

function makeStream(chunks: Array<string | Uint8Array>, errorAfter?: Error): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        const next = chunks[index++];
        controller.enqueue(typeof next === 'string' ? encoder.encode(next) : next);
        return;
      }
      if (errorAfter) {
        controller.error(errorAfter);
        return;
      }
      controller.close();
    },
  });
}

const VALID_REPORT_PAYLOAD = {
  id: 'session-1',
  jobTitle: 'Senior Backend Engineer',
  companyName: 'Acme Corp',
  resumeFilename: 'candidate.pdf',
  jdSourceName: 'Pasted Job Description',
  jdText: 'Backend role requiring Node.js and PostgreSQL.',
  resumeTextExcerpt: 'Experienced backend engineer.',
  compatibilityScore: 78,
  matchedSkills: [],
  partialSkills: [],
  missingSkills: [],
  resumeSkills: [],
  jdSkills: [],
  scoreBreakdown: {
    overallScore: 78,
    pillars: [
      {
        key: 'technical_skills',
        label: 'Technical Skills',
        weight: 0.6,
        rawScore: 78,
        weightedContribution: 47,
        formulaNote: 'ok',
      },
    ],
    summaryFormula: '0.6*78',
    isTechnicalRole: true,
  },
  experienceAlignment: {
    resumeYears: 5,
    requiredYears: 4,
    resumeSeniority: 'Senior',
    requiredSeniority: 'Senior',
    matchedDomains: ['Backend'],
    missingDomains: [],
    matchedQualifications: [],
    missingQualifications: [],
    matchedCertifications: [],
    missingCertifications: [],
    assessmentNote: 'Aligned experience.',
  },
  learningPlan: [],
  extractionMeta: {
    resumePageCount: 2,
    resumeExtractionMethod: 'pdf_text',
    resumeCharCount: 2100,
    jdInputType: 'text',
    jdPageCount: null,
    jdExtractionMethod: 'direct_text',
    jdCharCount: 950,
    semanticMatchingEngine: 'gemini_embedding_2',
    processingTimeMs: 4200,
  },
  completedDays: [1, 2],
  saved: false,
  createdAt: '2026-11-20T12:00:00.000Z',
};

test('normalizeApiBaseUrl and buildApiUrl handle empty, valid, trailing-slash, and unsafe values', () => {
  assert.equal(normalizeApiBaseUrl(undefined), '');
  assert.equal(normalizeApiBaseUrl('   '), '');
  assert.equal(normalizeApiBaseUrl('https://skillgap-m5.onrender.com/'), 'https://skillgap-m5.onrender.com');
  assert.equal(normalizeApiBaseUrl('https://skillgap-m5.onrender.com/api/'), 'https://skillgap-m5.onrender.com');
  assert.equal(normalizeApiBaseUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(normalizeApiBaseUrl('javascript:alert(1)'), '');
  assert.equal(normalizeApiBaseUrl('ftp://example.com'), '');

  assert.equal(buildApiUrl('/api/health', ''), '/api/health');
  assert.equal(buildApiUrl('api/health', 'https://api.example.com/'), 'https://api.example.com/api/health');
  assert.equal(buildApiUrl('/api/analyze-stream', 'https://api.example.com/api'), 'https://api.example.com/api/analyze-stream');
});

test('readAnalysisNdjsonStream buffers arbitrary split chunks and multi-byte UTF-8 safely', async () => {
  const progressLine = `${JSON.stringify({ type: 'progress', step: 1, message: 'Parsing — PDF ✓' })}\n`;
  const resultLine = JSON.stringify({ type: 'result', data: VALID_REPORT_PAYLOAD }); // intentionally no trailing newline
  const fullBytes = new TextEncoder().encode(progressLine + resultLine);

  // Split into tiny 7-byte chunks so JSON tokens and multi-byte UTF-8 characters split across reads.
  const tinyChunks: Uint8Array[] = [];
  for (let i = 0; i < fullBytes.length; i += 7) {
    tinyChunks.push(fullBytes.slice(i, i + 7));
  }

  const progressEvents: Array<{ step: number; message: string }> = [];
  const report = await readAnalysisNdjsonStream(makeStream(tinyChunks), {
    onProgress: (step, message) => progressEvents.push({ step, message }),
    validateReport: validateAnalysisReport,
  });

  assert.equal(progressEvents.length, 1);
  assert.equal(progressEvents[0].step, 1);
  assert.equal(progressEvents[0].message, 'Parsing — PDF ✓');
  assert.equal(report.jobTitle, 'Senior Backend Engineer');
  assert.equal(report.compatibilityScore, 78);
});

test('readAnalysisNdjsonStream rejects malformed JSON and HTML gateway errors without raw SyntaxError', async () => {
  await assert.rejects(
    () =>
      readAnalysisNdjsonStream(
        makeStream(['{"type":"progress","step":0,"message":"ok"}\n', '{truncated json\n']),
        { validateReport: validateAnalysisReport }
      ),
    (err: unknown) => {
      assert.ok(err instanceof StreamParseError);
      assert.equal(err.code, 'MALFORMED_CHUNK');
      assert.doesNotMatch(err.message, /SyntaxError/i);
      return true;
    }
  );

  await assert.rejects(
    () =>
      readAnalysisNdjsonStream(
        makeStream(['<!DOCTYPE html><html><body>502 Bad Gateway</body></html>\n']),
        { validateReport: validateAnalysisReport }
      ),
    (err: unknown) => {
      assert.ok(err instanceof StreamParseError);
      assert.equal(err.code, 'INTERRUPTED_STREAM');
      return true;
    }
  );
});

test('readAnalysisNdjsonStream handles dropped streams, empty streams, server errors, idle timeout, and cancellation', async () => {
  // Connection drop mid-stream
  await assert.rejects(
    () =>
      readAnalysisNdjsonStream(
        makeStream(['{"type":"progress","step":1,"message":"working"}\n'], new TypeError('network reset')),
        { validateReport: validateAnalysisReport }
      ),
    (err: unknown) => err instanceof StreamParseError && err.code === 'INTERRUPTED_STREAM'
  );

  // Empty stream without result
  await assert.rejects(
    () =>
      readAnalysisNdjsonStream(
        makeStream(['{"type":"progress","step":1,"message":"started"}\n']),
        { validateReport: validateAnalysisReport }
      ),
    (err: unknown) => err instanceof StreamParseError && err.code === 'EMPTY_STREAM'
  );

  // Server error frame
  await assert.rejects(
    () =>
      readAnalysisNdjsonStream(
        makeStream(['{"type":"error","error":"Password-protected PDF detected"}\n']),
        { validateReport: validateAnalysisReport }
      ),
    (err: unknown) =>
      err instanceof StreamParseError &&
      err.code === 'SERVER_ERROR' &&
      err.message === 'Password-protected PDF detected'
  );

  // Idle stream stall timeout
  const stalledStream = new ReadableStream<Uint8Array>({
    start() {
      // Never enqueues or closes.
    },
  });
  await assert.rejects(
    () => readAnalysisNdjsonStream(stalledStream, { idleTimeoutMs: 40 }),
    (err: unknown) => err instanceof StreamParseError && err.code === 'STREAM_TIMEOUT'
  );

  // Explicit caller AbortSignal cancellation
  const abortController = new AbortController();
  const cancellableStream = new ReadableStream<Uint8Array>({
    start() {
      setTimeout(() => abortController.abort(), 20);
    },
  });
  await assert.rejects(
    () =>
      readAnalysisNdjsonStream(cancellableStream, {
        idleTimeoutMs: 5_000,
        signal: abortController.signal,
      }),
    (err: unknown) => (err as { name?: string })?.name === 'AbortError'
  );
});

test('responseValidators defensively validate and normalize server payloads', () => {
  assert.throws(() => validateAnalysisReport(null), /invalid analysis report/i);
  assert.throws(() => validateAnalysisReport({ jobTitle: 'Dev' }), /compatibility score/i);

  const normalized = validateAnalysisReport({
    compatibilityScore: 105,
    jobTitle: '',
    completedDays: [1, 'bad', 3.5, 2],
  });
  assert.equal(normalized.compatibilityScore, 100);
  assert.equal(normalized.jobTitle, 'Untitled Role');
  assert.deepEqual(normalized.completedDays, [1, 2]);
  assert.deepEqual(normalized.matchedSkills, []);
  assert.deepEqual(normalized.scoreBreakdown.pillars, []);

  assert.throws(() => validateHistoryResponse({}), /unexpected analysis history/i);
  const history = validateHistoryResponse({
    analyses: [{ id: 7, jobTitle: 'ML Eng', compatibilityScore: 84 }, { invalid: true }],
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].id, 7);

  const quick = validateQuickScanResult({ jobTitle: 'QA Engineer', topSkills: ['Playwright', 123] });
  assert.deepEqual(quick.topSkills, ['Playwright']);

  assert.throws(() => validateCoachResponse({ answer: '' }), /empty or invalid/i);
  assert.equal(validateCoachResponse({ answer: 'Focus on Docker first.', latencyMs: 120 }).answer, 'Focus on Docker first.');
});

test('API client translates network errors, non-JSON 502 responses, and timeouts cleanly', async () => {
  const originalFetch = globalThis.fetch;

  try {
    // 1. Network offline / DNS failure
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    await assert.rejects(
      () => fetchAnalysisHistory('fake-token'),
      (err: unknown) => err instanceof ApiError && err.isNetworkError === true
    );

    // 2. Non-JSON 502 HTML gateway error
    globalThis.fetch = (async () =>
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      })) as typeof fetch;

    await assert.rejects(
      () => fetchAnalysisHistory('fake-token'),
      (err: unknown) => err instanceof ApiError && err.status === 502
    );

    // 3. Request timeout on runGapAnalysis
    globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abortErr = new Error('aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
        });
      })) as typeof fetch;

    const dummyPdf = new File(['%PDF-1.4'], 'resume.pdf', { type: 'application/pdf' });
    await assert.rejects(
      () =>
        runGapAnalysis({
          resumeFile: dummyPdf,
          jdText: 'Looking for a backend engineer with Node.js and PostgreSQL.',
          token: null,
          timeoutMs: 35,
        }),
      (err: unknown) => err instanceof ApiError && err.isTimeout === true
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
