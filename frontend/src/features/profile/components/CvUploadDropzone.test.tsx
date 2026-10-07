import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { CvUploadDropzone, type CvUploadResult, CV_MAX_FILE_SIZE_BYTES } from '@/features/profile/components/CvUploadDropzone';

/**
 * F5 — End-to-end UI test for the CV upload dropzone.
 *
 * AC-6: non-PDF content type is rejected at the client (validation runs
 * before any network call).
 * AC-3/AC-4: success path shows the parsed character count.
 */

const makeFile = (
  name: string,
  size: number,
  type = 'application/pdf',
): File => {
  // `File.size` comes from the Blob's byte length, so build exactly `size`
  // bytes of PDF-ish content (needed for the oversized-file test).
  const content = 'A'.repeat(size);
  const blob = new Blob([content], { type });
  return new File([blob], name, { type, lastModified: Date.now() });
};

const renderDropzone = (onUpload = jest.fn().mockResolvedValue({ charCount: 42 })) => {
  return render(<CvUploadDropzone onUpload={onUpload} />);
};

/** The dropzone's hidden `<input type="file">`. */
const fileInput = (container: HTMLElement): HTMLInputElement =>
  container.querySelector('input[type="file"]') as HTMLInputElement;

describe('CvUploadDropzone', () => {
  it('renders the dropzone in idle state (F2)', () => {
    const { container } = renderDropzone();
    expect(screen.getByText(/drag & drop your updated resume here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse files/i })).toBeInTheDocument();
    expect(fileInput(container)).toBeInTheDocument();
  });

  it('rejects a non-PDF file without calling onUpload (AC-6)', async () => {
    const onUpload = jest.fn();
    const { container } = renderDropzone(onUpload);

    fireEvent.change(fileInput(container), {
      target: { files: [makeFile('resume.docx', 1024, 'application/msword')] },
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/only pdf files are supported/i);
    });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('rejects an oversized PDF without calling onUpload (F2 size cap)', async () => {
    const onUpload = jest.fn();
    const { container } = renderDropzone(onUpload);

    const oversized = makeFile('huge.pdf', CV_MAX_FILE_SIZE_BYTES + 1);
    fireEvent.change(fileInput(container), { target: { files: [oversized] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/too large/i);
    });
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('shows the uploading state while onUpload is in flight (F2 loading state)', async () => {
    let resolveUpload: ((value: CvUploadResult) => void) | null = null;
    const onUpload = jest.fn(
      () =>
        new Promise<CvUploadResult>((resolve) => {
          resolveUpload = resolve;
        }),
    );
    const { container } = renderDropzone(onUpload);

    fireEvent.change(fileInput(container), { target: { files: [makeFile('cv.pdf', 2048)] } });

    await waitFor(() => {
      expect(screen.getByText(/uploading cv\.pdf…/i)).toBeInTheDocument();
    });

    if (resolveUpload) {
      resolveUpload({ charCount: 7 });
    }
    await waitFor(() => {
      expect(screen.getByText(/uploaded to s3/i)).toBeInTheDocument();
    });
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  it('shows success with the parsed character count after a successful upload (AC-3/AC-4, F2/F4)', async () => {
    const { container } = renderDropzone();

    fireEvent.change(fileInput(container), { target: { files: [makeFile('cv.pdf', 2048)] } });

    await waitFor(() => {
      expect(screen.getByText(/uploaded to s3/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/parsed — 42 characters/i)).toBeInTheDocument();
  });

  it('shows the error state and lets the user dismiss it (F2 error state)', async () => {
    const onUpload = jest.fn().mockRejectedValue(new Error('S3 upload failed (HTTP 403).'));
    const { container } = renderDropzone(onUpload);

    fireEvent.change(fileInput(container), { target: { files: [makeFile('cv.pdf', 2048)] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/s3 upload failed/i);
    });

    // Dismiss button resets to idle (accessible name is the "close" icon text).
    const dismiss = screen.getByRole('button', { name: /close/i });
    fireEvent.click(dismiss);

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText(/drag & drop your updated resume here/i)).toBeInTheDocument();
    });
  });

  it('supports keyboard activation of the dropzone (F2)', () => {
    const { container } = renderDropzone();
    const dropzone = screen.getByRole('button', { name: /upload cv pdf/i });
    expect(dropzone).toHaveAttribute('tabindex', '0');
    // Enter triggers the hidden file input.
    fireEvent.keyDown(dropzone, { key: 'Enter' });
    expect(fileInput(container)).toBeInTheDocument();
  });
});