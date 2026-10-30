import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { BadRequestError, DatabaseError } from '@common/ErrorTypes';

import type { UserProfile } from '../getProfile/types';

const USERS_TABLE_ENV_KEY = 'USERS_TABLE_NAME';

const PROFILE_DEFAULTS = {
  targetRoles: [],
  excludedKeywords: [],
  workModes: ['remote', 'hybrid'],
  minMonthlySalaryLkr: null as number | null,
  scheduleIntervalDays: 7,
  schedulerEnabled: false,
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/**
 * Fills in defaults for preference fields that are missing from a stored item.
 * Stored values always win, including an explicit `null` for minMonthlySalaryLkr.
 */
export const withProfileDefaults = (item: Partial<UserProfile>): UserProfile => ({
  excludedKeywords: [...PROFILE_DEFAULTS.excludedKeywords],
  workModes: [...PROFILE_DEFAULTS.workModes],
  minMonthlySalaryLkr: PROFILE_DEFAULTS.minMonthlySalaryLkr,
  scheduleIntervalDays: PROFILE_DEFAULTS.scheduleIntervalDays,
  ...item,
}) as UserProfile;

export const getProfile = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<UserProfile> => {
  const { sub, email } = extractCallerClaims(event);
  const tableName = resolveUsersTable();

  const getResult = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { userId: sub },
    }),
  );

  if (getResult.Item) {
    return withProfileDefaults(getResult.Item);
  }

  const profile = buildDefaultProfile(sub, email);

  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: profile,
        ConditionExpression: 'attribute_not_exists(userId)',
      }),
    );
  } catch (err) {
    if (isConditionalCheckFailedError(err)) {
      const retryResult = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { userId: sub },
        }),
      );
      if (retryResult.Item) {
        return withProfileDefaults(retryResult.Item);
      }
    }
    throw err;
  }

  return profile;
};

function isConditionalCheckFailedError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    '$metadata' in err &&
    (err as { name?: string }).name === 'ConditionalCheckFailedException'
  );
}
