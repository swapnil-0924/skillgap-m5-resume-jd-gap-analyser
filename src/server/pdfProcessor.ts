import { extractText, getDocumentProxy } from 'unpdf';

export class DocumentValidationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'DocumentValidationError';
    this.statusCode = statusCode;
  }
}

export interface ExtractedDocumentResult {
  text: string;
  pageCount: number;
  extractionMethod: 'pdf_text' | 'gemini_ocr' | 'hybrid_ocr';
  charCount: number;
}

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

export function sanitizeFilename(rawName: string): string {
  const base = rawName.split(/[\\/]/).pop() || 'document.pdf';
  const cleaned = base.replace(/[^a-zA-Z0-9._\-\s]/g, '_').trim();
  return cleaned.slice(0, 120) || 'document.pdf';
}

export function validatePdfBuffer(
  buffer: Buffer | undefined,
  originalName: string,
  mimeType?: string
): void {
  if (!buffer || buffer.length === 0) {
    throw new DocumentValidationError('The uploaded PDF file is empty (0 bytes).', 400);
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw new DocumentValidationError(
      'File exceeds the 10 MB maximum upload size limit. Please upload a smaller PDF.',
      413
    );
  }

  const lowerName = originalName.toLowerCase();
  const hasPdfExt = lowerName.endsWith('.pdf');
  const hasPdfMime =
    !mimeType ||
    mimeType === 'application/pdf' ||
    mimeType === 'application/x-pdf' ||
    mimeType === 'application/octet-stream';

  if (!hasPdfExt && mimeType && mimeType !== 'application/pdf') {
    throw new DocumentValidationError(
      'Unsupported file format. Only PDF documents (.pdf) are accepted.',
      400
    );
  }

  // Verify %PDF- magic header within the first 1024 bytes
  const headerSlice = buffer.subarray(0, Math.min(1024, buffer.length)).toString('latin1');
  if (!headerSlice.includes('%PDF-')) {
    throw new DocumentValidationError(
      'The uploaded file is not a valid PDF document or is corrupted (missing PDF header).',
      422
    );
  }

  if (!hasPdfExt && !hasPdfMime) {
    throw new DocumentValidationError(
      'Unsupported file format. Please upload a valid .pdf file.',
      400
    );
  }
}

function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts text from text-based, multi-column, table-heavy, scanned/image-based,
 * or mixed PDFs. Automatically falls back to Gemini multimodal OCR when selectable
 * text density is insufficient.
 */
export async function extractPdfDocument(
  buffer: Buffer,
  originalName: string,
  mimeType: string | undefined,
  ocrFallbackFn: (pdfBuffer: Buffer) => Promise<string>
): Promise<ExtractedDocumentResult> {
  validatePdfBuffer(buffer, originalName, mimeType);

  let pageCount = 1;
  let pagesText: string[] = [];

  try {
    const uint8 = new Uint8Array(buffer);
    const pdfProxy = await getDocumentProxy(uint8);
    pageCount = pdfProxy.numPages || 1;
    const extracted = await extractText(pdfProxy, { mergePages: false });
    if (Array.isArray(extracted.text)) {
      pagesText = extracted.text.map((p) => cleanExtractedText(String(p || '')));
    } else {
      pagesText = [cleanExtractedText(String(extracted.text || ''))];
    }
  } catch (error: unknown) {
    const errObj = error as { name?: string; message?: string };
    const msg = `${errObj?.name || ''} ${errObj?.message || ''}`.toLowerCase();

    if (msg.includes('password') || msg.includes('encrypted')) {
      throw new DocumentValidationError(
        'This PDF is password-protected or encrypted. Please remove the password and upload an unlocked PDF.',
        422
      );
    }

    if (
      msg.includes('invalid pdf') ||
      msg.includes('corrupt') ||
      msg.includes('xref') ||
      msg.includes('format error') ||
      msg.includes('bad endobj')
    ) {
      throw new DocumentValidationError(
        'This PDF file appears to be corrupted or unreadable. Please re-export it and try again.',
        422
      );
    }

    throw new DocumentValidationError(
      'Could not read the uploaded PDF document. Please verify the file is a valid, unencrypted PDF.',
      422
    );
  }

  if (pageCount > 25) {
    throw new DocumentValidationError(
      `This PDF has ${pageCount} pages. Please upload a document with 25 pages or fewer.`,
      422
    );
  }

  const combinedText = cleanExtractedText(pagesText.join('\n\n'));
  const avgCharsPerPage = pageCount > 0 ? combinedText.length / pageCount : combinedText.length;
  const lowDensityPages = pagesText.filter((t) => t.length < 40).length;

  const isMostlyScanned = combinedText.length < 100 || avgCharsPerPage < 80;
  const isMixedScanned = !isMostlyScanned && lowDensityPages > 0 && pageCount <= 10;

  if (isMostlyScanned || isMixedScanned) {
    try {
      const ocrText = cleanExtractedText(await ocrFallbackFn(buffer));
      if (ocrText.length >= 60) {
        return {
          text: ocrText,
          pageCount,
          extractionMethod: isMostlyScanned ? 'gemini_ocr' : 'hybrid_ocr',
          charCount: ocrText.length,
        };
      }
    } catch (ocrError) {
      console.error('OCR fallback failed:', ocrError);
      if (combinedText.length < 60) {
        throw new DocumentValidationError(
          'This appears to be a scanned/image-based PDF and OCR extraction is currently unavailable. Please upload a text-selectable PDF or retry shortly.',
          503
        );
      }
    }
  }

  if (combinedText.length < 40) {
    throw new DocumentValidationError(
      'No readable text could be extracted from this PDF. It may be blank or contain unreadable scanned images.',
      422
    );
  }

  return {
    text: combinedText,
    pageCount,
    extractionMethod: 'pdf_text',
    charCount: combinedText.length,
  };
}
