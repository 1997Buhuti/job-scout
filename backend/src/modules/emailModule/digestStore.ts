import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { DatabaseError } from '@common/ErrorTypes';
import type { EmailVerificationStatus } from '@modules/profileModule/getProfile/types';
import type { MatchResult } from '@modules/schedulerModule/runUserPipeline/types';

import type { DigestJob } from './buildDigest';

/** MVP cutoff for what counts as a "high-score" match worth emailing. */
export const MATCH_SCORE_THRESHOLD = 60;

const MATCHES_GSI1 = 'GSI1';
/** DynamoDB BatchGetItem allows at most 100 keys per call. */
const BATCH_GET_CHUNK_SIZE = 100;
/** Extra passes for keys DynamoDB returns as unprocessed under load. */
const MAX_UNPROCESSED_PASSES = 3;

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const resolveTable = (envKey: string): string => {
  const tableName = process.env[envKey];
  if (!tableName) {
    throw new DatabaseError(`Missing required environment variable ${envKey}`);
  }
  return tableName;
};

const toMatchResult = (item: Record<string, unknown>): MatchResult => ({
  partitionKey: String(item.partitionKey ?? item.PK),
  userId: String(item.userId),
  jobId: String(item.jobId),
  matchScore: Number(item.matchScore),
  reasoning: typeof item.reasoning === 'string' ? item.reasoning : '',
  matchingSkills: Array.isArray(item.matchingSkills)
    ? item.matchingSkills.filter((s): s is string => typeof s === 'string')
    : [],
  evaluatedAt: String(item.evaluatedAt ?? ''),
  ...(typeof item.sentAt === 'string' ? { sentAt: item.sentAt } : {}),
});

/**
 * M3: every qualifying match for the user that has no `sentAt`, through
 * the matches GSI (`gsi1pk = USER#{userId}`) with a filter. Per-user match
 * counts are small, so a filtered query is enough.
 */
export const loadUnsentMatches = async (userId: string): Promise<MatchResult[]> => {
  const tableName = resolveTable('MATCHES_TABLE_NAME');
  const matches: MatchResult[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: MATCHES_GSI1,
        KeyConditionExpression: 'gsi1pk = :pk',
        FilterExpression: 'attribute_not_exists(sentAt) AND matchScore >= :threshold',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':threshold': MATCH_SCORE_THRESHOLD,
        },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of result.Items ?? []) {
      matches.push(toMatchResult(item));
    }
    startKey = result.LastEvaluatedKey;
  } while (startKey);

  return matches;
};

/** Loads the job fields a digest needs for matches from earlier runs. */
export const loadDigestJobs = async (
  jobIds: string[],
): Promise<Record<string, DigestJob>> => {
  const jobs: Record<string, DigestJob> = {};
  if (jobIds.length === 0) {
    return jobs;
  }

  const tableName = resolveTable('JOBS_TABLE_NAME');
  const unique = [...new Set(jobIds)];

  for (let i = 0; i < unique.length; i += BATCH_GET_CHUNK_SIZE) {
    let keys: Record<string, unknown>[] = unique
      .slice(i, i + BATCH_GET_CHUNK_SIZE)
      .map((jobId) => ({ PK: `JOB#${jobId}`, SK: 'META' }));

    for (let pass = 0; keys.length > 0 && pass <= MAX_UNPROCESSED_PASSES; pass += 1) {
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: keys,
              ProjectionExpression: 'jobId, title, company, #url',
              ExpressionAttributeNames: { '#url': 'url' },
            },
          },
        }),
      );
      for (const item of result.Responses?.[tableName] ?? []) {
        if (typeof item.jobId === 'string') {
          jobs[item.jobId] = {
            title: typeof item.title === 'string' ? item.title : '',
            company: typeof item.company === 'string' ? item.company : '',
            url: typeof item.url === 'string' ? item.url : '',
          };
        }
      }
      keys = result.UnprocessedKeys?.[tableName]?.Keys ?? [];
    }
  }

  return jobs;
};

/**
 * Stamps `sentAt` after SES accepted the digest. The condition keeps an
 * existing stamp, so a repeated call can't move the timestamp.
 */
export const markMatchSent = async (match: MatchResult, sentAt: string): Promise<void> => {
  const tableName = resolveTable('MATCHES_TABLE_NAME');
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: match.partitionKey, SK: 'MATCH' },
        UpdateExpression: 'SET sentAt = :sentAt',
        ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(sentAt)',
        ExpressionAttributeValues: { ':sentAt': sentAt },
      }),
    );
  } catch (err) {
    if ((err as { name?: unknown } | null)?.name === 'ConditionalCheckFailedException') {
      return;
    }
    throw err;
  }
};

/**
 * Caches a refreshed SES recipient status on the profile. Skipped if the
 * profile's email changed since the status was read.
 */
export const saveRecipientStatus = async (
  userId: string,
  email: string,
  status: EmailVerificationStatus,
): Promise<void> => {
  const tableName = resolveTable('USERS_TABLE_NAME');
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { userId },
        UpdateExpression: 'SET emailVerificationStatus = :status',
        ConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':status': status, ':email': email },
      }),
    );
  } catch (err) {
    if ((err as { name?: unknown } | null)?.name === 'ConditionalCheckFailedException') {
      return;
    }
    throw err;
  }
};
