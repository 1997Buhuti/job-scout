/** Environment variable holding the private CV bucket name. */
export const CV_BUCKET_NAME_ENV_KEY = 'CV_BUCKET_NAME';

/** Only PDF uploads are accepted; the value is signed into the presigned URL. */
export const PDF_CONTENT_TYPE = 'application/pdf';

/** Object key layout: `cvs/{userId}/{timestampMs}.pdf`. */
export const CV_KEY_PREFIX = 'cvs';
export const CV_FILE_EXTENSION = '.pdf';

/** Short-lived presign TTL (seconds) to limit exposure of a leaked URL. */
export const CV_PRESIGN_EXPIRES_IN_SECONDS = 120;