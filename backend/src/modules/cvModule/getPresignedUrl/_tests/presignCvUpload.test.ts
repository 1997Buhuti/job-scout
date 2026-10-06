import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { CV_BUCKET_NAME_ENV_KEY, CV_PRESIGN_EXPIRES_IN_SECONDS, PDF_CONTENT_TYPE } from '@modules/cvModule/getPresignedUrl/constants';
import { presignCvUpload } from '@modules/cvModule/getPresignedUrl/presignCvUpload';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

const getSignedUrlMock = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

const signedCommandInput = (callIndex = 0): PutObjectCommand['input'] => (getSignedUrlMock.mock.calls[callIndex][1] as PutObjectCommand).input;

describe('presignCvUpload', () => {
  const originalEnv = process.env[CV_BUCKET_NAME_ENV_KEY];

  beforeEach(() => {
    process.env[CV_BUCKET_NAME_ENV_KEY] = 'job-scout-dev-cvs';
    getSignedUrlMock.mockResolvedValue('https://job-scout-dev-cvs.s3.amazonaws.com/presigned');
    jest.spyOn(Date, 'now').mockReturnValue(1750000000000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env[CV_BUCKET_NAME_ENV_KEY];
      return;
    }
    process.env[CV_BUCKET_NAME_ENV_KEY] = originalEnv;
  });

  it('returns the presigned upload URL, key and TTL (AC-1)', async () => {
    const result = await presignCvUpload({ userId: 'sub-123' });

    expect(result).toEqual({
      uploadUrl: 'https://job-scout-dev-cvs.s3.amazonaws.com/presigned',
      key: 'cvs/sub-123/1750000000000.pdf',
      expiresIn: CV_PRESIGN_EXPIRES_IN_SECONDS,
    });
  });

  it('scopes the object key to the authenticated user (AC-1)', async () => {
    await presignCvUpload({ userId: 'sub-abc' });

    expect(getSignedUrlMock.mock.calls[0][1]).toBeInstanceOf(PutObjectCommand);
    expect(signedCommandInput()).toEqual({
      Bucket: 'job-scout-dev-cvs',
      Key: 'cvs/sub-abc/1750000000000.pdf',
      ContentType: PDF_CONTENT_TYPE,
    });
  });

  it('signs a short-lived URL (FR-1)', async () => {
    await presignCvUpload({ userId: 'sub-123' });

    expect(getSignedUrlMock).toHaveBeenCalledWith(expect.anything(), expect.any(PutObjectCommand), { expiresIn: 120 });
    expect(CV_PRESIGN_EXPIRES_IN_SECONDS).toBeLessThanOrEqual(300);
  });

  it('presigns with an S3 client that disables default CRC32 checksums', async () => {
    await presignCvUpload({ userId: 'sub-123' });

    // Browser PUTs only send Content-Type; signed checksum query params → 403.
    const client = getSignedUrlMock.mock.calls[0][0] as { config?: { requestChecksumCalculation?: () => Promise<string> } };
    const checksumMode = await client.config?.requestChecksumCalculation?.();
    expect(checksumMode).toBe('WHEN_REQUIRED');
  });

  it('defaults to application/pdf when no content type is supplied', async () => {
    await presignCvUpload({ userId: 'sub-123' });

    expect(signedCommandInput().ContentType).toBe(PDF_CONTENT_TYPE);
  });

  it('accepts application/pdf with parameters', async () => {
    await expect(presignCvUpload({ userId: 'sub-123', contentType: 'application/pdf; charset=binary' })).resolves.toBeDefined();
  });

  it('rejects a non-PDF content type (AC-6)', async () => {
    await expect(presignCvUpload({ userId: 'sub-123', contentType: 'application/msword' })).rejects.toThrow('Unsupported content type');
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('fails loudly when the CV bucket name is not configured', async () => {
    delete process.env[CV_BUCKET_NAME_ENV_KEY];

    await expect(presignCvUpload({ userId: 'sub-123' })).rejects.toThrow(CV_BUCKET_NAME_ENV_KEY);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });
});