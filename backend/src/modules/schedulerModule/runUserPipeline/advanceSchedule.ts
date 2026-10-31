import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { DatabaseError } from '@common/ErrorTypes';

const USERS_TABLE_ENV_KEY = 'USERS_TABLE_NAME';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
 * matches), stamps `lastRunAt = now` and `nextRunAt = lastRunAt +
 * scheduleIntervalDays` (UTC), refreshing `gsi1sk` so the dispatcher's
 * due-user GSI1 query (`gsi1pk` stays `SCHED#true`) reflects the new
 * `nextRunAt`.
 */
export const advanceUserSchedule = async (
  userId: string,
  scheduleIntervalDays: number,
): Promise<AdvanceScheduleResult> => {
  const tableName = resolveUsersTable();

  const lastRunAt = new Date().toISOString();
  const nextRunAt = new Date(Date.parse(lastRunAt) + scheduleIntervalDays * MS_PER_DAY).toISOString();

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
