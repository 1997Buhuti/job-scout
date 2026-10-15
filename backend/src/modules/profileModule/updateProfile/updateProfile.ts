import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

import { BadRequestError, DatabaseError } from '@common/ErrorTypes';

import { extractCallerClaims } from '@modules/profileModule/getProfile/getProfile';
import type { UpdateProfileRequest } from './types';
import type { UserProfile } from '../getProfile/types';

const USERS_TABLE_ENV_KEY = 'USERS_TABLE_NAME';
const MAX_TARGET_ROLES = 10;
const MAX_ROLE_LENGTH = 80;

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

export const updateProfile = async (
  event: APIGatewayProxyEventV2,
): Promise<UserProfile> => {
  const { sub } = extractCallerClaims(event);
  const tableName = resolveUsersTable();

  const body = event.body
    ? typeof event.body === 'string'
      ? JSON.parse(event.body)
      : event.body
    : {};

  const { targetRoles } = body as Partial<UpdateProfileRequest>;

  let updateExpression = 'SET updatedAt = :updatedAt';
  const expressionAttributeValues: Record<string, unknown> = {
    ':updatedAt': new Date().toISOString(),
  };

  if (targetRoles !== undefined) {
    const validatedRoles = validateTargetRoles(targetRoles);
    updateExpression += ', targetRoles = :targetRoles';
    expressionAttributeValues[':targetRoles'] = validatedRoles;
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

  return updateResult.Attributes as UserProfile;
};
