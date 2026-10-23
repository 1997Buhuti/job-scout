import {
  EmptyPdfTextError,
  MAX_PDF_PAGES,
  PDF_WORKER_URL,
  PdfReadError,
  extractPdfText,
} from '../extractPdfText';
import { MAX_CV_TEXT_LENGTH } from '../structureExtraction';

const mockSetWorker = jest.fn();
const mockGetText = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue(undefined);
const mockConstructor = jest.fn();

jest.mock('pdf-parse', () => ({
  PDFParse: class {
    static setWorker(workerSrc?: string): void {
      mockSetWorker(workerSrc);
    }
    constructor(options: unknown) {
      mockConstructor(options);
    }
    getText = (params: unknown) => mockGetText(params);
    destroy = () => mockDestroy();
  },
}));

/** jsdom's File may lack arrayBuffer(); provide a deterministic one. */
const makePdfFile = (): File => {
  const file = new File(['%PDF-1.4 fake'], 'cv.pdf', { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(Uint8Array.from([0x25, 0x50, 0x44, 0x46]).buffer),
  });
  return file;
};

const textResult = (...pages: string[]) => ({
  pages: pages.map((text, index) => ({ num: index + 1, text })),
});

describe('extractPdfText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDestroy.mockResolvedValue(undefined);
  });

  it('joins page text, normalizes it and configures the worker', async () => {
    mockGetText.mockResolvedValue(textResult('JOHN SMITH\n\u2022 React \u2013 Node.js', 'Page two'));

    const text = await extractPdfText(makePdfFile());

    expect(text).toBe('JOHN SMITH\n• React - Node.js\n\nPage two');
    expect(mockSetWorker).toHaveBeenCalledWith(PDF_WORKER_URL);
    expect(mockConstructor).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
  });

  it('limits pages, enforces line breaks and avoids page-marker text', async () => {
    mockGetText.mockResolvedValue(textResult('text'));

    await extractPdfText(makePdfFile());

    expect(mockGetText).toHaveBeenCalledWith(
      expect.objectContaining({ first: MAX_PDF_PAGES, lineEnforce: true, pageJoiner: '' }),
    );
  });

  it('truncates very long text to the CV text limit', async () => {
    mockGetText.mockResolvedValue(textResult('a'.repeat(MAX_CV_TEXT_LENGTH + 5000)));

    const text = await extractPdfText(makePdfFile());

    expect(text).toHaveLength(MAX_CV_TEXT_LENGTH);
  });

  it('throws EmptyPdfTextError for PDFs without extractable text', async () => {
    mockGetText.mockResolvedValue(textResult('   \n  ', ''));

    await expect(extractPdfText(makePdfFile())).rejects.toBeInstanceOf(EmptyPdfTextError);
  });

  it('wraps parser failures in PdfReadError and still releases the parser', async () => {
    mockGetText.mockRejectedValue(new Error('Invalid PDF structure'));

    await expect(extractPdfText(makePdfFile())).rejects.toBeInstanceOf(PdfReadError);
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('releases the parser after a successful read too', async () => {
    mockGetText.mockResolvedValue(textResult('hello'));

    await extractPdfText(makePdfFile());

    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('does not fail if destroy() rejects', async () => {
    mockGetText.mockResolvedValue(textResult('hello'));
    mockDestroy.mockRejectedValue(new Error('already destroyed'));

    await expect(extractPdfText(makePdfFile())).resolves.toBe('hello');
  });
});
