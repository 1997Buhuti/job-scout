'use client';

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';

/** Maximum accepted CV size (spec: cap the PDF in the UI, e.g. 5 MB). */
export const CV_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const PDF_CONTENT_TYPE = 'application/pdf';
const PDF_EXTENSION = '.pdf';

/** Result of a successful upload, supplied by the caller's upload handler. */
export interface CvUploadResult {
  /** Parsed character count (from POST /cv/parse) shown in the success state. */
  charCount?: number;
}

interface CvUploadDropzoneProps {
  /**
   * Performs the upload (presign → PUT to S3 → parse). Reject/throw to
   * surface the error state.
   */
  onUpload: (file: File) => Promise<CvUploadResult | void>;
}

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; fileName: string }
  | {
      status: 'success';
      fileName: string;
      sizeLabel: string;
      charCount?: number;
    }
  | { status: 'error'; message: string };

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
};

const validateCvFile = (file: File): string | null => {
  const isPdf =
    file.type === PDF_CONTENT_TYPE || file.name.toLowerCase().endsWith(PDF_EXTENSION);

  if (!isPdf) {
    return 'Only PDF files are supported. Please choose a .pdf file.';
  }

  if (file.size > CV_MAX_FILE_SIZE_BYTES) {
    return `File is too large (${formatBytes(file.size)}). Maximum size is ${formatBytes(CV_MAX_FILE_SIZE_BYTES)}.`;
  }

  return null;
};

export function CvUploadDropzone({ onUpload }: CvUploadDropzoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ status: 'idle' });

  const processFile = useCallback(
    async (file: File) => {
      const validationError = validateCvFile(file);
      if (validationError) {
        setState({ status: 'error', message: validationError });
        return;
      }

      setState({ status: 'uploading', fileName: file.name });

      try {
        const result = await onUpload(file);
        setState({
          status: 'success',
          fileName: file.name,
          sizeLabel: formatBytes(file.size),
          charCount: result?.charCount,
        });
      } catch (err) {
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Upload failed. Please try again.',
        });
      }
    },
    [onUpload],
  );

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    // Reset so selecting the same file again re-triggers onChange.
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && state.status !== 'uploading') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  const isBusy = state.status === 'uploading';

  return (
    <div className="relative">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={`${PDF_CONTENT_TYPE},${PDF_EXTENSION}`}
        className="hidden"
        tabIndex={-1}
        aria-hidden
      />

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!isBusy) {
            fileInputRef.current?.click();
          }
        }}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Upload CV PDF"
        aria-busy={isBusy}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          isBusy
            ? 'cursor-wait border-outline-variant/20 bg-surface-container/20'
            : isDragging
              ? 'cursor-pointer border-secondary bg-surface-container/80'
              : 'cursor-pointer border-outline-variant/40 bg-surface-container/40 hover:border-secondary'
        }`}
      >
        {state.status === 'uploading' ? (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-secondary">
              <span className="material-symbols-outlined animate-spin text-[24px]">
                sync
              </span>
            </div>
            <div className="mb-1 text-base font-medium text-on-surface">
              Uploading {state.fileName}…
            </div>
            <div className="text-xs text-outline">
              Uploading directly to S3, then parsing.
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
              <span className="material-symbols-outlined text-[24px]">
                upload_file
              </span>
            </div>
            <div className="mb-1 text-base font-medium text-on-surface">
              Drag &amp; drop your updated resume here
            </div>
            <div className="mb-4 text-xs text-outline">
              PDF only, up to 5 MB. Uploaded directly to S3 via a presigned URL.
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="rounded-lg bg-surface-container-high px-4 py-2 text-xs font-medium text-on-surface hover:bg-surface-bright transition-colors"
            >
              Browse Files
            </button>
          </>
        )}
      </div>

      {/* Error State */}
      {state.status === 'error' && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-3 rounded-xl border border-error/30 bg-error-container/20 p-4"
        >
          <span className="material-symbols-outlined shrink-0 text-[20px] text-error">
            error
          </span>
          <div className="min-w-0 flex-1 text-sm text-error">
            {state.message}
          </div>
          <button
            type="button"
            onClick={reset}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-error-container/30 hover:text-error transition-colors"
            title="Dismiss error"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* Success State */}
      {state.status === 'success' && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-secondary/30 bg-secondary/10 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/20 text-secondary">
            <span className="material-symbols-outlined text-[20px]">
              check_circle
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-on-surface">
              {state.fileName}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-on-surface-variant">
              <span>{state.sizeLabel}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">
                  verified
                </span>
                Uploaded to S3
              </span>
              {state.charCount !== undefined && (
                <>
                  <span>•</span>
                  <span>Parsed — {state.charCount.toLocaleString()} characters</span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
            title="Upload another CV"
          >
            <span className="material-symbols-outlined text-[18px]">
              refresh
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
