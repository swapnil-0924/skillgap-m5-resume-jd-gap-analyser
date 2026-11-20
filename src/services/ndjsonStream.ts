import type { AnalysisReport } from '../types/analysis';

export interface StreamEventHandlers {
  onProgress?: (stepIndex: number, message: string) => void;
  validateReport?: (raw: unknown) => AnalysisReport;
  idleTimeoutMs?: number;
  signal?: AbortSignal;
}

export class StreamParseError extends Error {
  readonly code: 'MALFORMED_CHUNK' | 'INTERRUPTED_STREAM' | 'EMPTY_STREAM' | 'STREAM_TIMEOUT' | 'SERVER_ERROR';

  constructor(
    message: string,
    code: StreamParseError['code']
  ) {
    super(message);
    this.name = 'StreamParseError';
    this.code = code;
  }
}

type RawStreamEvent = {
  type?: unknown;
  step?: unknown;
  message?: unknown;
  data?: unknown;
  error?: unknown;
};

function looksLikeHtmlOrGatewayError(line: string): boolean {
  const lower = line.slice(0, 80).trim().toLowerCase();
  return (
    lower.startsWith('<!doctype') ||
    lower.startsWith('<html') ||
    lower.startsWith('<head') ||
    lower.startsWith('<body') ||
    lower.startsWith('upstream ') ||
    lower.startsWith('502 ') ||
    lower.startsWith('504 ')
  );
}

function parseNdjsonEventLine(line: string): RawStreamEvent {
  try {
    const parsed: unknown = JSON.parse(line);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new StreamParseError(
        'Received an unexpected data format from the analysis server. Please retry.',
        'MALFORMED_CHUNK'
      );
    }
    return parsed as RawStreamEvent;
  } catch (error: unknown) {
    if (error instanceof StreamParseError) {
      throw error;
    }
    if (looksLikeHtmlOrGatewayError(line)) {
      throw new StreamParseError(
        'The server or proxy interrupted the analysis stream with an unexpected gateway response. Please try again.',
        'INTERRUPTED_STREAM'
      );
    }
    throw new StreamParseError(
      'Received an incomplete or malformed update while streaming analysis results. Please retry.',
      'MALFORMED_CHUNK'
    );
  }
}

function createAbortError(message = 'Analysis request was cancelled.'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

async function readChunkWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  idleTimeoutMs: number | undefined,
  signal: AbortSignal | undefined
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal?.aborted) {
    throw createAbortError();
  }
  if (!idleTimeoutMs || idleTimeoutMs <= 0) {
    return reader.read();
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let onAbort: (() => void) | null = null;

  try {
    return await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      timer = setTimeout(() => {
        void reader.cancel('Stream idle timeout').catch(() => {});
        reject(
          new StreamParseError(
            'The analysis stream stopped responding before completing. Please check your connection and try again.',
            'STREAM_TIMEOUT'
          )
        );
      }, idleTimeoutMs);

      if (signal) {
        onAbort = () => {
          void reader.cancel('Request aborted').catch(() => {});
          reject(createAbortError());
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }

      reader.read().then(resolve, reject);
    });
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onAbort) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

/**
 * Safely consumes an NDJSON ReadableStream from POST /api/analyze-stream.
 * Handles arbitrary chunk splits, multi-byte UTF-8 boundaries, malformed lines,
 * connection interruptions, idle timeouts, and user cancellations.
 */
export async function readAnalysisNdjsonStream(
  body: ReadableStream<Uint8Array>,
  handlers: StreamEventHandlers = {}
): Promise<AnalysisReport> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalReport: AnalysisReport | null = null;

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;

    const evt = parseNdjsonEventLine(line);
    if (evt.type === 'progress') {
      const step = typeof evt.step === 'number' && Number.isFinite(evt.step) ? evt.step : 0;
      const message = typeof evt.message === 'string' ? evt.message : '';
      handlers.onProgress?.(step, message);
      return;
    }

    if (evt.type === 'error') {
      const serverMsg =
        typeof evt.error === 'string' && evt.error.trim()
          ? evt.error.trim()
          : 'Analysis failed on the server.';
      throw new StreamParseError(serverMsg, 'SERVER_ERROR');
    }

    if (evt.type === 'result') {
      finalReport = handlers.validateReport
        ? handlers.validateReport(evt.data)
        : (evt.data as AnalysisReport);
    }
  };

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await readChunkWithIdleTimeout(reader, handlers.idleTimeoutMs, handlers.signal);
      } catch (err: unknown) {
        if ((err as { name?: string })?.name === 'AbortError' || handlers.signal?.aborted) {
          throw createAbortError();
        }
        if (err instanceof StreamParseError) {
          throw err;
        }
        throw new StreamParseError(
          'Connection was interrupted while receiving analysis results. Please check your network and try again.',
          'INTERRUPTED_STREAM'
        );
      }

      if (chunk.done) {
        break;
      }

      if (chunk.value && chunk.value.byteLength > 0) {
        buffer += decoder.decode(chunk.value, { stream: true });

        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          processLine(line);
          newlineIndex = buffer.indexOf('\n');
        }
      }
    }

    // Flush any remaining multi-byte UTF-8 decoder state on EOF.
    buffer += decoder.decode();
    if (buffer.trim()) {
      for (const remainingLine of buffer.split('\n')) {
        if (remainingLine.trim()) {
          processLine(remainingLine);
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignore if lock was already released.
    }
  }

  if (!finalReport) {
    throw new StreamParseError(
      'Analysis ended before returning a complete report. The connection may have been interrupted—please try again.',
      'EMPTY_STREAM'
    );
  }

  return finalReport;
}
