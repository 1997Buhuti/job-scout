import { MAX_CV_TEXT_LENGTH, normalizeCvText } from './structureExtraction';

/**
 * URL of the pdf.js worker used by `pdf-parse` in the browser. The file is
 * copied from `node_modules` into `public/` by `scripts/copy-pdf-worker.mjs`
 * (runs automatically before `npm run dev` and `npm run build`).
 */
export const PDF_WORKER_URL = '/pdf.worker.mjs';

/** Only the first pages of a CV matter; also bounds work on huge files. */
export const MAX_PDF_PAGES = 10;

/** Hard stop so a pathological PDF cannot hang the upload. */
export const PDF_EXTRACT_TIMEOUT_MS = 15_000;

/** The PDF opened fine but contains no extractable text (e.g. a scanned image). */
export class EmptyPdfTextError extends Error {
  constructor() {
    super('The PDF contains no extractable text.');
    this.name = 'EmptyPdfTextError';
  }
}

/** The PDF could not be read (corrupt, encrypted, worker failed, timeout...). */
export class PdfReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PdfReadError';
  }
}

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PdfReadError('Reading the PDF timed out.')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

/**
 * Extracts plain text from a PDF **in the browser** using `pdf-parse`'s web
 * build (pdf.js). Line breaks are reconstructed by the library from text-item
 * positions so section headings stay on their own lines.
 *
 * - Client only: `pdf-parse` is imported lazily here, never at module load,
 *   so it is not part of the initial bundle and never runs during SSR.
 * - Reads at most `MAX_PDF_PAGES` pages and returns at most
 *   `MAX_CV_TEXT_LENGTH` characters of normalized text.
 *
 * @throws EmptyPdfTextError when no text could be extracted
 * @throws PdfReadError for any other failure
 */
export async function extractPdfText(file: File): Promise<string> {
  if (typeof window === 'undefined') {
    throw new PdfReadError('PDF text extraction is only available in the browser.');
  }

  let parser: { destroy(): Promise<void> } | undefined;
  try {
    const { PDFParse } = await import('pdf-parse');
    PDFParse.setWorker(PDF_WORKER_URL);

    const data = new Uint8Array(await file.arrayBuffer());
    const instance = new PDFParse({ data });
    parser = instance;

    const result = await withTimeout(
      instance.getText({
        first: MAX_PDF_PAGES,
        lineEnforce: true,
        cellSeparator: ' ',
        pageJoiner: '',
      }),
      PDF_EXTRACT_TIMEOUT_MS,
    );

    const text = normalizeCvText(result.pages.map((page) => page.text).join('\n\n'));
    if (!text) throw new EmptyPdfTextError();
    return text.slice(0, MAX_CV_TEXT_LENGTH);
  } catch (error) {
    if (error instanceof EmptyPdfTextError || error instanceof PdfReadError) throw error;
    throw new PdfReadError('Could not read the PDF.', { cause: error });
  } finally {
    // Always release the worker/document, even after errors or timeouts.
    await parser?.destroy().catch(() => undefined);
  }
}
