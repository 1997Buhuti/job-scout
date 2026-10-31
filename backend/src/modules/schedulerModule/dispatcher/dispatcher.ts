import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { SCHEDULER_SERVICE } from '@common/constants';
import { DatabaseError } from '@common/ErrorTypes';
import { Logger } from '@common/logger';

import type { UserProfile } from '@modules/profileModule/getProfile/types';
import type { RunSchedulerPipelineDeps } from '@modules/schedulerModule/runUserPipeline/runSchedulerPipelineForUser';
import { runSchedulerPipelineForUser } from '@modules/schedulerModule/runUserPipeline/runSchedulerPipelineForUser';

const USERS_TABLE_ENV_KEY = 'USERS_TABLE_NAME';
const GSI1_INDEX_NAME = 'GSI1';

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);
const logger = new Logger(SCHEDULER_SERVICE);

const resolveUsersTable = (): string => {
  const tableName = process.env[USERS_TABLE_ENV_KEY];
  if (!tableName) {
    throw new DatabaseError(`Missing required environment variable ${USERS_TABLE_ENV_KEY}`);
  }
  return tableName;
};

export type QueryDueUsers = (nowIso: string) => Promise<UserProfile[]>;
export type RunPipelineForUser = (user: UserProfile) => Promise<unknown>;

/**
 * B3/B4: one shared GSI1 query (`gsi1pk = SCHED#true`, `gsi1sk <= NEXT#{now}`)
 * — never a per-user scan or a per-user EventBridge rule.
 */
const defaultQueryDueUsers: QueryDueUsers = async (nowIso) => {
  const tableName = resolveUsersTable();
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: GSI1_INDEX_NAME,
      KeyConditionExpression: 'gsi1pk = :pk AND gsi1sk <= :sk',
      ExpressionAttributeValues: {
        ':pk': 'SCHED#true',
        ':sk': `NEXT#${nowIso}`,
      },
    }),
  );
  return (result.Items ?? []) as UserProfile[];
};

export interface DispatchDueUsersDeps {
  queryDueUsers?: QueryDueUsers;
  runPipelineForUser?: RunPipelineForUser;
  /** Only used when `runPipelineForUser` isn't supplied. */
  runSchedulerPipelineDeps?: RunSchedulerPipelineDeps;
  now?: () => Date;
}

export interface DispatchDueUsersResult {
  dueCount: number;
  processed: string[];
  skipped: string[];
  failed: string[];
}

/**
 * B4: queries due enabled users and runs the full scheduler pipeline for
 * each one, sequentially. A user without a CV or with no target roles is
 * skipped (logged, not an error). One user's thrown error is caught and
 * logged so it doesn't stop the rest of the batch from being processed.
 */
export const dispatchDueUsers = async (
  deps: DispatchDueUsersDeps = {},
): Promise<DispatchDueUsersResult> => {
  const queryDueUsers = deps.queryDueUsers ?? defaultQueryDueUsers;
  const runPipelineForUser =
    deps.runPipelineForUser ??
    ((user: UserProfile) =>
      runSchedulerPipelineForUser(
        {
          userId: user.userId,
          email: user.email,
          targetRoles: user.targetRoles,
          scheduleIntervalDays: user.scheduleIntervalDays,
        },
        deps.runSchedulerPipelineDeps,
      ));
  const now = deps.now ?? (() => new Date());

  const dueUsers = await queryDueUsers(now().toISOString());

  const processed: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const user of dueUsers) {
    if (!user.cvS3Key) {
      logger.info({
        message: 'Skipping due user: no CV uploaded',
        data: { userId: user.userId },
      });
      skipped.push(user.userId);
      continue;
    }

    if (!user.targetRoles || user.targetRoles.length === 0) {
      logger.info({
        message: 'Skipping due user: no target roles configured',
        data: { userId: user.userId },
      });
      skipped.push(user.userId);
      continue;
    }

    try {
      await runPipelineForUser(user);
      processed.push(user.userId);
    } catch (err) {
      logger.error(err, `Scheduler pipeline failed for user ${user.userId}`);
      failed.push(user.userId);
    }
  }

  return { dueCount: dueUsers.length, processed, skipped, failed };
};
