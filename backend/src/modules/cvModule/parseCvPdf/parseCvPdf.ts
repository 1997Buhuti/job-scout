import { DynamoDBClient, UpdateItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { BadRequestError, DatabaseError, ForbiddenError } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import { resolveCallerId } from '@modules/cvModule/getPresignedUrl/resolveCallerId';

import type { CvProfile, ParseCvRequest, ParseCvResult } from './types';
import { sanitizeCvProfile } from './validateCvProfile';

const USERS_TABLE_NAME_ENV_KEY = 'USERS_TABLE_NAME';

/** A sanitized profile is a few KB; anything much larger is not a CV profile. */
export const MAX_REQUEST_BODY_BYTES = 64 * 1024;

/** Marshals a sanitized profile; absent optional fields are omitted, not stored as NULL. */
const toCvProfileAttribute = (profile: CvProfile): AttributeValue => {
  const withOptional = (base: Record<string, AttributeValue>, optional: Record<string, string | undefined>) => {
    Object.entries(optional).forEach(([name, value]) => {
      if (value) base[name] = { S: value };
    });
    return base;
  };

  return {
    M: withOptional(
      {
        skills: { L: profile.skills.map((skill) => ({ S: skill })) },
        experience: {
          L: profile.experience.map((entry) => ({
            M: withOptional(
              { title: { S: entry.title }, company: { S: entry.company } },
              { period: entry.period, summary: entry.summary },
            ),
          })),
        },
        education: {
          L: profile.education.map((entry) => ({
            M: withOptional(
              { institution: { S: entry.institution } },
              { degree: entry.degree, field: entry.field, year: entry.year },
            ),
          })),
        },
        extractedAt: { S: profile.extractedAt },
        sourceCvS3Key: { S: profile.sourceCvS3Key },
      },
      { fullName: profile.fullName, summary: profile.summary },
    ),
  };
};

/**
 * `POST /cv/parse` - persists the uploaded CV on the caller's `UserProfile`.
 *
 * The browser extracts the PDF text and structures it (see the frontend
 * `features/cv` module); this function does no PDF parsing. It:
 *
 * 1. authenticates the caller and checks the key is under `cvs/{userId}/`
 * 2. sanitizes the client-supplied `cvProfile` (untrusted input), if present
 * 3. writes `cvS3Key`, `updatedAt` and - only when a profile was supplied -
 *    `cvProfile`. Omitting `cvProfile` keeps any previously stored one.
 */
export const parseCvPdf = async ({
  event,
  logger,
}: {
  event: APIGatewayProxyEventV2;
  logger?: Logger;
}): Promise<ParseCvResult> => {
  const usersTableName = process.env[USERS_TABLE_NAME_ENV_KEY];
  if (!usersTableName) {
    throw new Error(`Missing required environment variable ${USERS_TABLE_NAME_ENV_KEY}`);
  }

  const userId = resolveCallerId(event);

  if (typeof event?.body === 'string' && Buffer.byteLength(event.body, 'utf8') > MAX_REQUEST_BODY_BYTES) {
    throw new BadRequestError('Request body is too large');
  }

  let body: unknown;
  try {
    body = typeof event?.body === 'string' ? JSON.parse(event.body) : event?.body;
  } catch (err) {
    throw new BadRequestError('Request body must be valid JSON', err);
  }

  const { key, cvProfile: rawCvProfile } = (body ?? {}) as Partial<ParseCvRequest>;

  if (typeof key !== 'string' || key.trim() === '') {
    throw new BadRequestError('key is required');
  }

  const expectedPrefix = `cvs/${userId}/`;
  if (!key.startsWith(expectedPrefix)) {
    throw new ForbiddenError(`Key must start with ${expectedPrefix}`);
  }

  const cvProfile =
    rawCvProfile === undefined || rawCvProfile === null ? undefined : sanitizeCvProfile(rawCvProfile, key);

  const updateExpressionParts = ['cvS3Key = :cvS3Key', 'updatedAt = :updatedAt'];
  const expressionAttributeValues: Record<string, AttributeValue> = {
    ':cvS3Key': { S: key },
    ':updatedAt': { S: new Date().toISOString() },
  };

  if (cvProfile) {
    updateExpressionParts.push('cvProfile = :cvProfile');
    expressionAttributeValues[':cvProfile'] = toCvProfileAttribute(cvProfile);
  }

  try {
    await new DynamoDBClient({ region: 'us-east-1' }).send(
      new UpdateItemCommand({
        TableName: usersTableName,
        Key: { userId: { S: userId } },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ExpressionAttributeValues: expressionAttributeValues,
      }),
    );
  } catch (err) {
    // The client must not believe the CV was saved when it was not.
    throw new DatabaseError('Could not save the CV to the profile', err);
  }

  // Counts only - never log CV content.
  logger?.info({
    message: 'Saved CV for user profile',
    data: {
      userId,
      key,
      hasCvProfile: !!cvProfile,
      skills: cvProfile?.skills.length ?? 0,
      experience: cvProfile?.experience.length ?? 0,
      education: cvProfile?.education.length ?? 0,
    },
  });

  return { key };
};
