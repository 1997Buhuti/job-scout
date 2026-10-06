import { getApiBaseUrl } from './config';
import { getIdToken } from './profileService';

/** Response of `POST /cv/presign` (unwrapped from the `{ data }` envelope). */
export interface PresignedCvUpload {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

/** Response of `POST /cv/parse` (unwrapped from the `{ data }` envelope). */
export interface ParsedCvResult {
  key: string;
  text: string;
  charCount: number;
}

/** Only PDF uploads are accepted; the value is signed into the presigned URL. */
const PDF_CONTENT_TYPE = 'application/pdf';

interface ApiErrorBody {
  error?: { message?: string; code?: string };
}

/**
 * Extracts the backend error message from the `{ error: { message } }`
 * envelope so users see the API's reason (e.g. "Unsupported content type").
 */
async function toApiError(res: Response, fallback: string): Promise<Error> {
  let message = fallback;
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (typeof body?.error?.message === 'string' && body.error.message) {
      message = body.error.message;
    }
  } catch {
    // Non-JSON error body — keep the fallback message.
  }
  return new Error(`${message} (HTTP ${res.status})`);
}

/**
 * Step 1: obtain a short-lived presigned PUT URL for the caller's CV object
 * (`cvs/{userId}/{timestamp}.pdf`). Requires a signed-in Cognito session.
 */
export async function requestCvPresign(
  contentType: string = PDF_CONTENT_TYPE,
): Promise<PresignedCvUpload> {
  const token = await getIdToken();
  if (!token) {
    throw new Error('You must be signed in to upload a CV.');
  }

  const res = await fetch(`${getApiBaseUrl()}/cv/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ contentType }),
  });

  if (!res.ok) {
    throw await toApiError(res, 'Could not create a presigned upload URL');
  }

  const body = (await res.json()) as { data?: PresignedCvUpload };
  if (!body?.data) {
    throw new Error('Unexpected response from the presign endpoint');
  }
  return body.data;
}

/**
 * Step 2: PUT the PDF straight to S3. No file bytes pass through the API.
 * The presigned URL signs `Content-Type: application/pdf`, so the header
 * must match exactly.
 */
export async function uploadCvToS3(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': PDF_CONTENT_TYPE },
    body: file,
  });

  if (!res.ok) {
    throw new Error(`S3 upload failed (HTTP ${res.status}). Please try again.`);
  }
}

/**
 * Step 3: parse the uploaded object and persist `UserProfile.cvS3Key`.
 */
export async function parseCvPdf(key: string): Promise<ParsedCvResult> {
  const token = await getIdToken();
  if (!token) {
    throw new Error('You must be signed in to parse a CV.');
  }

  const res = await fetch(`${getApiBaseUrl()}/cv/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ key }),
  });

  if (!res.ok) {
    throw await toApiError(res, 'Could not parse the uploaded CV');
  }

  const body = (await res.json()) as { data?: ParsedCvResult };
  if (!body?.data) {
    throw new Error('Unexpected response from the parse endpoint');
  }
  return body.data;
}

/**
 * Full client flow: presign → PUT to S3 → parse. Returns the parse result so
 * the UI can surface the extracted character count.
 */
export async function uploadAndParseCv(file: File): Promise<ParsedCvResult> {
  const { uploadUrl, key } = await requestCvPresign();
  await uploadCvToS3(uploadUrl, file);
  return parseCvPdf(key);
}
