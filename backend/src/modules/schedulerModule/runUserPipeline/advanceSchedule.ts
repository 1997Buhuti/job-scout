import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { DatabaseError } from '@common/ErrorTypes';

import { nextScheduledRunAt } from './nextScheduledRunAt';

const USERS_TABLE_ENV_KEY = 'USERS_TABLE_NAME';

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const resolveUsersTable = (): string => {
  const tableName = process.env[USERS_TABLE_ENV_KEY];
  if (!tableName) {
    throw new DatabaseError(`Missing required environment variable ${USERS_TABLE_ENV_KEY}`);
  }
  return tableName;
};

export interface AdvanceScheduleResult {
  lastRunAt: string;
  nextRunAt: string;
}

/**
 * B9: on every successful pipeline completion (including zero new
 * matches), stamps `lastRunAt = now` and sets `nextRunAt` to the next IST
 * calendar boundary (daily: midnight, weekly: Monday midnight, monthly:
 * 1st of the month). Refreshes `gsi1sk` so the dispatcher's due-user GSI1
 * query (`gsi1pk` stays `SCHED#true`) reflects the new `nextRunAt`.
 */
export const advanceUserSchedule = async (
  userId: string,
  scheduleIntervalDays: number,
): Promise<AdvanceScheduleResult> => {
  const tableName = resolveUsersTable();

  const now = new Date();
  const lastRunAt = now.toISOString();
  const nextRunAt = nextScheduledRunAt(scheduleIntervalDays, now).toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { userId },
      UpdateExpression:
        'SET lastRunAt = :lastRunAt, nextRunAt = :nextRunAt, updatedAt = :updatedAt, gsi1sk = :gsi1sk',
      ExpressionAttributeValues: {
        ':lastRunAt': lastRunAt,
        ':nextRunAt': nextRunAt,
        ':updatedAt': lastRunAt,
        ':gsi1sk': `NEXT#${nextRunAt}`,
      },
    }),
  );

  return { lastRunAt, nextRunAt };
};
