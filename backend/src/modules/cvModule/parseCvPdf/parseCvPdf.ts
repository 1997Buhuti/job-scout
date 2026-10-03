import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { BadRequestError, ForbiddenError } from '@common/ErrorTypes';
import { resolveCallerId } from '@modules/cvModule/getPresignedUrl/resolveCallerId';

import type { ParseCvRequest, ParseCvResult } from './types';

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

export const parseCvPdf = async ({ event }: { event: APIGatewayProxyEventV2 }): Promise<ParseCvResult> => {
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
  const text = extractPdfText(pdfBytes);

  if (!text) {
    throw new BadRequestError('Unable to extract text from PDF');
  }

  const dynamodb = new DynamoDBClient({ region: 'us-east-1' });
  await dynamodb.send(
    new UpdateItemCommand({
      TableName: usersTableName,
      Key: {
        userId: { S: userId },
      },
      UpdateExpression: 'SET cvS3Key = :cvS3Key, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':cvS3Key': { S: key },
        ':updatedAt': { S: new Date().toISOString() },
      },
    }),
  );

  return {
    key,
    text,
    charCount: text.length,
  };
};
