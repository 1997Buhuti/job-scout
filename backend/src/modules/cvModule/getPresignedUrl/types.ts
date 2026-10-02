/** Optional request body for `POST /cv/presign`. */
export interface PresignCvRequest {
  contentType?: string;
}

/** Response returned to the browser so it can PUT the PDF straight to S3. */
export interface PresignCvUpload {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export interface PresignCvUploadParams {
  /** Cognito `sub` claim of the authenticated caller. */
  userId: string;
  contentType?: string;
}