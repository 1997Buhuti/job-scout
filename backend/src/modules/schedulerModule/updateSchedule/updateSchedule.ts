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
import type { UserProfile } from '@modules/profileModule/getProfile/types';
import type { UpdateScheduleRequest } from './types';

const USERS_TABLE_ENV_KEY = 'USERS_TABLE_NAME';
const MIN_SCHEDULE_INTERVAL_DAYS = 1;
const MAX_SCHEDULE_INTERVAL_DAYS = 30;

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

export const validateScheduleIntervalDays = (value: unknown): number => {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_SCHEDULE_INTERVAL_DAYS ||
    value > MAX_SCHEDULE_INTERVAL_DAYS
  ) {
    throw new BadRequestError(
      `scheduleIntervalDays must be an integer from ${MIN_SCHEDULE_INTERVAL_DAYS} to ${MAX_SCHEDULE_INTERVAL_DAYS}`,
    );
  }
  return value;
};

export const validateSchedulerEnabled = (value: unknown): boolean => {
  if (typeof value !== 'boolean') {
    throw new BadRequestError('schedulerEnabled must be a boolean');
  }
  return value;
};

export const updateSchedule = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<UserProfile> => {
  const { sub } = extractCallerClaims(event);
  const tableName = resolveUsersTable();

  const body = event.body
    ? typeof event.body === 'string'
      ? JSON.parse(event.body)
      : event.body
    : {};

  const { scheduleIntervalDays, schedulerEnabled } =
    body as Partial<UpdateScheduleRequest>;

  let updateExpression = 'SET updatedAt = :updatedAt';
  const expressionAttributeValues: Record<string, unknown> = {
    ':updatedAt': new Date().toISOString(),
  };

  if (scheduleIntervalDays !== undefined) {
    updateExpression += ', scheduleIntervalDays = :scheduleIntervalDays';
    expressionAttributeValues[':scheduleIntervalDays'] =
      validateScheduleIntervalDays(scheduleIntervalDays);
  }

  if (schedulerEnabled !== undefined) {
    const validatedSchedulerEnabled = validateSchedulerEnabled(schedulerEnabled);
    updateExpression += ', schedulerEnabled = :schedulerEnabled';
    expressionAttributeValues[':schedulerEnabled'] = validatedSchedulerEnabled;

    if (validatedSchedulerEnabled) {
      // MVP: when enabling and there is no nextRunAt yet, make the user
      // eligible on the dispatcher's next tick instead of deferring a full
      // interval.
      const getResult = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { userId: sub },
        }),
      );

      if (!getResult.Item?.nextRunAt) {
        updateExpression += ', nextRunAt = :nextRunAt';
        expressionAttributeValues[':nextRunAt'] = new Date().toISOString();
      }
    }
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
    throw new DatabaseError('Failed to update schedule');
  }

  return withProfileDefaults(updateResult.Attributes);
};
