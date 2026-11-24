import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { PROFILE_SERVICE } from '@common/constants';
import { BadRequestError, DatabaseError } from '@common/ErrorTypes';
import { Logger } from '@common/logger';
import { requestRecipientVerification } from '@modules/emailModule/recipientStatus';

import type { UserProfile } from '../getProfile/types';

const USERS_TABLE_ENV_KEY = 'USERS_TABLE_NAME';

const PROFILE_DEFAULTS = {
  targetRoles: [],
  excludedKeywords: [],
  workModes: ['remote', 'hybrid'],
  minMonthlySalaryLkr: null as number | null,
  scheduleIntervalDays: 7,
  schedulerEnabled: false,
  emailVerificationStatus: 'NOT_REQUESTED',
  emailSuppressed: false,
} as const;

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

interface CallerClaims {
  sub: string;
  email: string;
}

export const extractCallerClaims = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): CallerClaims => {
  const claims = event.requestContext.authorizer?.jwt?.claims;

  const sub = claims?.sub;
  if (typeof sub !== 'string' || !sub) {
    throw new BadRequestError('Missing Cognito sub claim in authorizer');
  }

  const email = claims?.email;
  if (typeof email !== 'string' || !email) {
    throw new BadRequestError('Missing email claim in authorizer');
  }

  return { sub, email };
};

const resolveUsersTable = (): string => {
  const tableName = process.env[USERS_TABLE_ENV_KEY];
  if (!tableName) {
    throw new DatabaseError(
      `Missing required environment variable ${USERS_TABLE_ENV_KEY}`,
    );
  }
  return tableName;
};

export const buildDefaultProfile = (
  userId: string,
  email: string,
): UserProfile => ({
  userId,
  email,
  targetRoles: [...PROFILE_DEFAULTS.targetRoles],
  excludedKeywords: [...PROFILE_DEFAULTS.excludedKeywords],
  workModes: [...PROFILE_DEFAULTS.workModes],
  minMonthlySalaryLkr: PROFILE_DEFAULTS.minMonthlySalaryLkr,
  scheduleIntervalDays: PROFILE_DEFAULTS.scheduleIntervalDays,
  schedulerEnabled: PROFILE_DEFAULTS.schedulerEnabled,
  emailVerificationStatus: PROFILE_DEFAULTS.emailVerificationStatus,
  emailSuppressed: PROFILE_DEFAULTS.emailSuppressed,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/**
 * Fills in defaults for fields that are missing from a stored item.
 * Stored values always win, including an explicit `null` for minMonthlySalaryLkr.
 */
export const withProfileDefaults = (item: Partial<UserProfile>): UserProfile => ({
  excludedKeywords: [...PROFILE_DEFAULTS.excludedKeywords],
  workModes: [...PROFILE_DEFAULTS.workModes],
  minMonthlySalaryLkr: PROFILE_DEFAULTS.minMonthlySalaryLkr,
  scheduleIntervalDays: PROFILE_DEFAULTS.scheduleIntervalDays,
  emailVerificationStatus: PROFILE_DEFAULTS.emailVerificationStatus,
  emailSuppressed: PROFILE_DEFAULTS.emailSuppressed,
  ...item,
}) as UserProfile;

/**
 * `GET /me/profile`. Creates the profile on first read, keeps the stored
 * email in step with the Cognito claim (FR-8), and, in SES sandbox mode,
 * requests recipient verification for a profile that has not had one (FR-3).
 */
export const getProfile = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  logger: Logger = new Logger(PROFILE_SERVICE),
): Promise<UserProfile> => {
  const { sub, email } = extractCallerClaims(event);
  const tableName = resolveUsersTable();

  const stored =
    (await readProfile(tableName, sub)) ??
    (await createProfile(tableName, sub, email));
  const profile = await backfillEmail(tableName, stored, email);

  return ensureRecipientVerification(tableName, profile, logger);
};

const readProfile = async (
  tableName: string,
  userId: string,
): Promise<UserProfile | undefined> => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { userId },
    }),
  );
  return result.Item ? withProfileDefaults(result.Item) : undefined;
};

const createProfile = async (
  tableName: string,
  userId: string,
  email: string,
): Promise<UserProfile> => {
  const profile = buildDefaultProfile(userId, email);

  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: profile,
        ConditionExpression: 'attribute_not_exists(userId)',
      }),
    );
    return profile;
  } catch (err) {
    if (isConditionalCheckFailedError(err)) {
      // Another request created the profile first; use the stored copy.
      const existing = await readProfile(tableName, userId);
      if (existing) {
        return existing;
      }
    }
    throw err;
  }
};

/**
 * Writes the Cognito email claim when the stored email is missing or differs.
 * A new address has not been verified or bounced, so verification restarts
 * and suppression is cleared.
 */
const backfillEmail = async (
  tableName: string,
  profile: UserProfile,
  email: string,
): Promise<UserProfile> => {
  if (profile.email === email) {
    return profile;
  }

  const updatedAt = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { userId: profile.userId },
      UpdateExpression:
        'SET email = :email, emailVerificationStatus = :notRequested, ' +
        'emailSuppressed = :notSuppressed, updatedAt = :updatedAt ' +
        'REMOVE emailSuppressedReason, emailSuppressedAt',
      ConditionExpression: 'attribute_exists(userId)',
      ExpressionAttributeValues: {
        ':email': email,
        ':notRequested': 'NOT_REQUESTED',
        ':notSuppressed': false,
        ':updatedAt': updatedAt,
      },
    }),
  );

  const {
    emailSuppressedReason: _reason,
    emailSuppressedAt: _at,
    ...rest
  } = profile;
  return {
    ...rest,
    email,
    emailVerificationStatus: 'NOT_REQUESTED',
    emailSuppressed: false,
    updatedAt,
  };
};

/**
 * Best effort: requests SES verification when the profile has none yet and
 * stores the result. Any failure is logged and leaves the status at
 * `NOT_REQUESTED`, so the next profile read tries again. It never fails the
 * request. Outside sandbox mode no SES call is made.
 */
const ensureRecipientVerification = async (
  tableName: string,
  profile: UserProfile,
  logger: Logger,
): Promise<UserProfile> => {
  if (profile.emailVerificationStatus !== 'NOT_REQUESTED') {
    return profile;
  }

  try {
    const status = await requestRecipientVerification(profile.email);
    if (status === null || status === 'NOT_REQUESTED') {
      return profile;
    }

    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { userId: profile.userId },
        UpdateExpression: 'SET emailVerificationStatus = :status',
        // Skip the write if the email changed concurrently; that address
        // starts again from NOT_REQUESTED.
        ConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':status': status,
          ':email': profile.email,
        },
      }),
    );

    logger.info({
      message: 'Recipient verification status stored',
      data: { userId: profile.userId, emailVerificationStatus: status },
    });
    return { ...profile, emailVerificationStatus: status };
  } catch (err) {
    logger.warn({
      message:
        'Recipient verification request failed; will retry on next profile read',
      data: { userId: profile.userId },
      error: describeError(err),
    });
    return profile;
  }
};

const describeError = (err: unknown): { name: string; message: string } =>
  err instanceof Error
    ? { name: err.name, message: err.message }
    : { name: 'UnknownError', message: String(err) };

function isConditionalCheckFailedError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    '$metadata' in err &&
    (err as { name?: string }).name === 'ConditionalCheckFailedException'
  );
}
