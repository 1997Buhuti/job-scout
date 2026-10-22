import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { BadRequestError, ForbiddenError } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import { resolveCallerId } from '@modules/cvModule/getPresignedUrl/resolveCallerId';

import type { ParseCvRequest, ParseCvResult, CvProfile } from './types';
import { structureCvProfile } from './structureExtraction';

const CV_BUCKET_NAME_ENV_KEY = 'CV_BUCKET_NAME';
const USERS_TABLE_NAME_ENV_KEY = 'USERS_TABLE_NAME';

const extractPdfText = (pdfBytes: Buffer): string => {
  const contents = pdfBytes.toString('utf8');

  const match = contents.match(/\((?:\\.|[^()\\])*\)/g) ?? [];
  const text = match
    .map((chunk) => chunk.replace(/^\(|\)$/g, '').replace(/\\\((?=.)|\\\)(?=.)|\\n|\\r|\\t|\\b|\\f/g, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
};

const toBuffer = async (body: unknown): Promise<Buffer> => {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (typeof body === 'string') {
    return Buffer.from(body);
  }

  if (body && typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === 'function') {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }

  if (body && typeof body === 'object' && 'getReader' in body) {
    const stream = body as ReadableStream<Uint8Array>;
    const reader = stream.getReader();
    const chunks: Buffer[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks);
  }

  throw new BadRequestError('Unsupported PDF response body format');
};

export const parseCvPdf = async ({ event, logger }: { event: APIGatewayProxyEventV2; logger?: Logger }): Promise<ParseCvResult> => {
  const bucketName = process.env[CV_BUCKET_NAME_ENV_KEY];
  const usersTableName = process.env[USERS_TABLE_NAME_ENV_KEY];

  if (!bucketName) {
    throw new Error(`Missing required environment variable ${CV_BUCKET_NAME_ENV_KEY}`);
  }

  if (!usersTableName) {
    throw new Error(`Missing required environment variable ${USERS_TABLE_NAME_ENV_KEY}`);
  }

  const userId = resolveCallerId(event);

  let body: unknown;
  try {
    body = typeof event?.body === 'string' ? JSON.parse(event.body) : event?.body;
  } catch (err) {
    throw new BadRequestError('Request body must be valid JSON', err);
  }

  const { key } = (body ?? {}) as Partial<ParseCvRequest>;

  if (typeof key !== 'string' || key.trim() === '') {
    throw new BadRequestError('key is required');
  }

  const expectedPrefix = `cvs/${userId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new ForbiddenError(`Key must start with ${expectedPrefix}`);
  }

  const client = new S3Client({ region: 'us-east-1' });
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }),
  );

  const payload = response.Body as unknown;
  if (payload === undefined || payload === null) {
    throw new BadRequestError('CV object is empty');
  }

  const pdfBytes = await toBuffer(payload);
  let text = extractPdfText(pdfBytes);

  if (!text) {
    throw new BadRequestError('Unable to extract text from PDF');
  }

  // B14: Input validation - truncate CV text to max 50,000 chars
  const MAX_CV_TEXT_LENGTH = 50000;
  if (text.length > MAX_CV_TEXT_LENGTH) {
    const originalLength = text.length;
    text = text.substring(0, MAX_CV_TEXT_LENGTH);
    logger?.info({ message: 'CV text truncated to max length', data: { originalLength, maxLength: MAX_CV_TEXT_LENGTH } });
  }

  // Initialize result with basic parsing data
  const result: ParseCvResult = {
    key,
    text,
    charCount: text.length,
  };

  // B10: Call structureCvProfile to get cvProfile
  let cvProfile: CvProfile | undefined;
  try {
    cvProfile = structureCvProfile(text, key);
    result.cvProfile = cvProfile;
    logger?.info({ message: 'Successfully structured CV profile', data: { skills: cvProfile.skills.length, experience: cvProfile.experience.length, education: cvProfile.education.length } });
  } catch (extractErr) {
    // B13: Error handling - don't fail the upload, just log and continue
    logger?.warn({ message: 'Failed to structure CV profile', data: { error: extractErr instanceof Error ? extractErr.message : String(extractErr), key } });
    // If extraction fails, we'll try to preserve the previous profile in DynamoDB update
  }

  // B11: Add DynamoDB UpdateItem call to persist cvProfile
  const dynamodb = new DynamoDBClient({ region: 'us-east-1' });
  
  // Prepare update expression and attribute values
  const updateExpressionParts: string[] = ['cvS3Key = :cvS3Key', 'updatedAt = :updatedAt'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expressionAttributeValues: Record<string, any> = {
    ':cvS3Key': { S: key },
    ':updatedAt': { S: new Date().toISOString() },
  };

  // Only include cvProfile in update if extraction succeeded
  if (cvProfile) {
    updateExpressionParts.push('cvProfile = :cvProfile');
    expressionAttributeValues[':cvProfile'] = {
      M: {
        fullName: cvProfile.fullName ? { S: cvProfile.fullName } : { NULL: true },
        summary: cvProfile.summary ? { S: cvProfile.summary } : { NULL: true },
        skills: { L: cvProfile.skills.map((skill) => ({ S: skill })) },
        experience: {
          L: cvProfile.experience.map((exp) => ({
            M: {
              title: { S: exp.title },
              company: { S: exp.company },
              period: exp.period ? { S: exp.period } : { NULL: true },
              summary: exp.summary ? { S: exp.summary } : { NULL: true },
            },
          })),
        },
        education: {
          L: cvProfile.education.map((edu) => ({
            M: {
              institution: { S: edu.institution },
              degree: edu.degree ? { S: edu.degree } : { NULL: true },
              field: edu.field ? { S: edu.field } : { NULL: true },
              year: edu.year ? { S: edu.year } : { NULL: true },
            },
          })),
        },
        extractedAt: { S: cvProfile.extractedAt },
        sourceCvS3Key: { S: cvProfile.sourceCvS3Key },
      },
    };
  }

  try {
    await dynamodb.send(
      new UpdateItemCommand({
        TableName: usersTableName,
        Key: {
          userId: { S: userId },
        },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
      }),
    );
    logger?.info({ message: 'Updated user profile in DynamoDB', data: { userId, key, hasCvProfile: !!cvProfile } });
  } catch (dbErr) {
    logger?.error({ message: 'Failed to update user profile in DynamoDB', data: { error: dbErr instanceof Error ? dbErr.message : String(dbErr), userId } });
    // Don't throw - we still want to return the response even if DynamoDB update fails
  }

  return result;
};
