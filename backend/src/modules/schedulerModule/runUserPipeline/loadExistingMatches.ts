import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchGetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { DatabaseError } from '@common/ErrorTypes';

import type { JobPosting } from './types';

const MATCHES_TABLE_ENV_KEY = 'MATCHES_TABLE_NAME';
/** DynamoDB BatchGetItem allows at most 100 keys per call. */
const BATCH_GET_CHUNK_SIZE = 100;

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const resolveMatchesTable = (): string => {
  const tableName = process.env[MATCHES_TABLE_ENV_KEY];
  if (!tableName) {
    throw new DatabaseError(`Missing required environment variable ${MATCHES_TABLE_ENV_KEY}`);
  }
  return tableName;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

/**
 * B6: the already-suggested rule in `specs/02-database-schema.md` §3 — if a
 * `MatchResult` row exists for `${userId}#${jobId}`, that job must be
 * omitted from this and every later evaluation/digest cycle for the user,
 * regardless of `sentAt`.
 */
export const loadExistingMatchIds = async (
  userId: string,
  jobIds: string[],
): Promise<Set<string>> => {
  if (jobIds.length === 0) {
    return new Set();
  }

  const tableName = resolveMatchesTable();
  const existing = new Set<string>();

  for (const keyChunk of chunk(jobIds, BATCH_GET_CHUNK_SIZE)) {
    const result = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [tableName]: {
            Keys: keyChunk.map((jobId) => ({ PK: `${userId}#${jobId}`, SK: 'MATCH' })),
          },
        },
      }),
    );

    const items = result.Responses?.[tableName] ?? [];
    for (const item of items) {
      if (typeof item.jobId === 'string') {
        existing.add(item.jobId);
      }
    }
  }

  return existing;
};

/** In-run dedup by `jobId`, keeping the first occurrence. */
export const dedupeByJobId = (jobs: JobPosting[]): JobPosting[] => {
  const seen = new Set<string>();
  const deduped: JobPosting[] = [];
  for (const job of jobs) {
    if (seen.has(job.jobId)) continue;
    seen.add(job.jobId);
    deduped.push(job);
  }
  return deduped;
};
