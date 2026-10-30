import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

import { BadRequestError, DatabaseError } from '@common/ErrorTypes';

import {
  extractCallerClaims,
  withProfileDefaults,
} from '@modules/profileModule/getProfile/getProfile';
import type { UpdateProfileRequest } from './types';
import type { UserProfile, WorkMode } from '../getProfile/types';
import type { CvProfile } from '@modules/cvModule/parseCvPdf/types';

const USERS_TABLE_ENV_KEY = 'USERS_TABLE_NAME';
const MAX_TARGET_ROLES = 10;
const MAX_ROLE_LENGTH = 80;
const MAX_EXCLUDED_KEYWORDS = 20;
const MAX_EXCLUDED_KEYWORD_LENGTH = 40;
const WORK_MODES: readonly WorkMode[] = ['remote', 'hybrid', 'onsite'];
const MAX_MIN_MONTHLY_SALARY_LKR = 10_000_000;
const ALLOWED_SCHEDULE_INTERVAL_DAYS: readonly number[] = [1, 7, 30];

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const resolveUsersTable = (): string => {
  const tableName = process.env[USERS_TABLE_ENV_KEY];
  if (!tableName) {
    throw new DatabaseError(
      `Missing required environment variable ${USERS_TABLE_ENV_KEY}`,
    );
  }
  return tableName;
};

export const validateTargetRoles = (roles: unknown): string[] => {
  if (!Array.isArray(roles)) {
    throw new BadRequestError('targetRoles must be an array of strings');
  }

  const trimmed = roles.map((r) => {
    if (typeof r !== 'string') {
      throw new BadRequestError('targetRoles must contain only strings');
    }
    return r.trim();
  });

  const filtered = trimmed.filter((r) => r !== '');
  if (filtered.length !== trimmed.length) {
    throw new BadRequestError('targetRoles entries must not be empty strings');
  }

  if (filtered.length > MAX_TARGET_ROLES) {
    throw new BadRequestError(
      `targetRoles must contain at most ${MAX_TARGET_ROLES} entries`,
    );
  }

  for (const role of filtered) {
    if (role.length > MAX_ROLE_LENGTH) {
      throw new BadRequestError(
        `targetRoles entries must be at most ${MAX_ROLE_LENGTH} characters`,
      );
    }
  }

  return filtered;
};

/** Trims, lowercases, and deduplicates keywords. Returns the stored form. */
export const validateExcludedKeywords = (keywords: unknown): string[] => {
  if (!Array.isArray(keywords)) {
    throw new BadRequestError('excludedKeywords must be an array of strings');
  }

  const normalized = keywords.map((k) => {
    if (typeof k !== 'string') {
      throw new BadRequestError('excludedKeywords must contain only strings');
    }
    const value = k.trim().toLowerCase();
    if (value === '') {
      throw new BadRequestError('excludedKeywords entries must not be empty');
    }
    if (value.length > MAX_EXCLUDED_KEYWORD_LENGTH) {
      throw new BadRequestError(
        `excludedKeywords entries must be at most ${MAX_EXCLUDED_KEYWORD_LENGTH} characters`,
      );
    }
    return value;
  });

  const unique = [...new Set(normalized)];
  if (unique.length > MAX_EXCLUDED_KEYWORDS) {
    throw new BadRequestError(
      `excludedKeywords must contain at most ${MAX_EXCLUDED_KEYWORDS} entries`,
    );
  }

  return unique;
};

export const validateWorkModes = (modes: unknown): WorkMode[] => {
  if (!Array.isArray(modes) || modes.length === 0) {
    throw new BadRequestError('workModes must be a non-empty array');
  }

  for (const mode of modes) {
    if (typeof mode !== 'string' || !WORK_MODES.includes(mode as WorkMode)) {
      throw new BadRequestError(
        `workModes must contain only: ${WORK_MODES.join(', ')}`,
      );
    }
  }

  return [...new Set(modes as WorkMode[])];
};

export const validateMinMonthlySalaryLkr = (value: unknown): number | null => {
  if (value === null) {
    return null;
  }
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_MIN_MONTHLY_SALARY_LKR
  ) {
    throw new BadRequestError(
      `minMonthlySalaryLkr must be null or an integer from 0 to ${MAX_MIN_MONTHLY_SALARY_LKR}`,
    );
  }
  return value;
};

export const validateScheduleIntervalDays = (value: unknown): number => {
  if (
    typeof value !== 'number' ||
    !ALLOWED_SCHEDULE_INTERVAL_DAYS.includes(value)
  ) {
    throw new BadRequestError('scheduleIntervalDays must be 1, 7, or 30');
  }
  return value;
};

export const updateProfile = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<UserProfile> => {
  const { sub } = extractCallerClaims(event);
  const tableName = resolveUsersTable();

  const body = event.body
    ? typeof event.body === 'string'
      ? JSON.parse(event.body)
      : event.body
    : {};

  const {
    targetRoles,
    excludedKeywords,
    workModes,
    minMonthlySalaryLkr,
    scheduleIntervalDays,
    cvProfile,
  } = body as Partial<UpdateProfileRequest>;

  let updateExpression = 'SET updatedAt = :updatedAt';
  const expressionAttributeValues: Record<string, unknown> = {
    ':updatedAt': new Date().toISOString(),
  };

  if (targetRoles !== undefined) {
    const validatedRoles = validateTargetRoles(targetRoles);
    updateExpression += ', targetRoles = :targetRoles';
    expressionAttributeValues[':targetRoles'] = validatedRoles;
  }

  if (excludedKeywords !== undefined) {
    updateExpression += ', excludedKeywords = :excludedKeywords';
    expressionAttributeValues[':excludedKeywords'] =
      validateExcludedKeywords(excludedKeywords);
  }

  if (workModes !== undefined) {
    updateExpression += ', workModes = :workModes';
    expressionAttributeValues[':workModes'] = validateWorkModes(workModes);
  }

  if (minMonthlySalaryLkr !== undefined) {
    updateExpression += ', minMonthlySalaryLkr = :minMonthlySalaryLkr';
    expressionAttributeValues[':minMonthlySalaryLkr'] =
      validateMinMonthlySalaryLkr(minMonthlySalaryLkr);
  }

  if (scheduleIntervalDays !== undefined) {
    updateExpression += ', scheduleIntervalDays = :scheduleIntervalDays';
    expressionAttributeValues[':scheduleIntervalDays'] =
      validateScheduleIntervalDays(scheduleIntervalDays);
  }

  if (cvProfile !== undefined) {
    // Validate cvProfile is an object (but don't fully parse - that happens in /cv/parse)
    if (typeof cvProfile !== 'object' || cvProfile === null) {
      throw new BadRequestError('cvProfile must be an object if provided');
    }
    updateExpression += ', cvProfile = :cvProfile';
    expressionAttributeValues[':cvProfile'] = cvProfile;
  }

  const updateResult = await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { userId: sub },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    }),
  );

  if (!updateResult.Attributes) {
    const getResult = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { userId: sub },
      }),
    );

    if (!getResult.Item) {
      throw new BadRequestError('Profile not found');
    }

    return await import('@modules/profileModule/getProfile/getProfile').then(
      ({ buildDefaultProfile }) =>
        buildDefaultProfile(sub, getResult.Item.email as string),
    );
  }

  return withProfileDefaults(updateResult.Attributes);
};
