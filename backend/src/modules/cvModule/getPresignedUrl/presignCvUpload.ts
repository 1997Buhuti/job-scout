import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ApplicationError } from '@common/ErrorTypes';

import { buildCvObjectKey } from './cvObjectKey';
import { CV_BUCKET_NAME_ENV_KEY, CV_PRESIGN_EXPIRES_IN_SECONDS } from './constants';
import { PresignCvUpload, PresignCvUploadParams } from './types';
import { validateCvContentType } from './validateCvContentType';

/**
 * SDK v3.729+ signs CRC32 checksum headers into PutObject by default. A
 * browser PUT only sends `Content-Type`, so those extra signed headers make
 * S3 reject the upload with 403. Disable automatic checksums for presigns.
 */
const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
});

const resolveBucketName = (): string => {
  const bucketName = process.env[CV_BUCKET_NAME_ENV_KEY];
  if (!bucketName) {
    throw new ApplicationError(`Missing required environment variable ${CV_BUCKET_NAME_ENV_KEY}`);
  }
  return bucketName;
};

/**
 * Issues a short-lived presigned PUT so the browser uploads the PDF straight
 * to the private CV bucket. No file bytes pass through this Lambda.
 */
export const presignCvUpload = async ({ userId, contentType }: PresignCvUploadParams): Promise<PresignCvUpload> => {
  const bucket = resolveBucketName();
  const resolvedContentType = validateCvContentType(contentType);
  const key = buildCvObjectKey(userId, Date.now());

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: resolvedContentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: CV_PRESIGN_EXPIRES_IN_SECONDS });

  return { uploadUrl, key, expiresIn: CV_PRESIGN_EXPIRES_IN_SECONDS };
};