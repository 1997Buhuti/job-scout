import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { DatabaseError } from '@common/ErrorTypes';

import { jobIdFromUrl } from './jobId';
import type { JobPosting, ScrapedJob } from './types';

const JOBS_TABLE_ENV_KEY = 'JOBS_TABLE_NAME';

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const resolveJobsTable = (): string => {
  const tableName = process.env[JOBS_TABLE_ENV_KEY];
  if (!tableName) {
    throw new DatabaseError(`Missing required environment variable ${JOBS_TABLE_ENV_KEY}`);
  }
  return tableName;
};

/**
 * Upserts a `JobPosting` by URL-hash `jobId` (see `jobIdFromUrl`). Calling
 * this twice for the same `url` always targets the same `PK`/`SK`, so
 * re-scraping a listing overwrites it rather than creating a duplicate.
 */
export const upsertJobPosting = async (job: ScrapedJob): Promise<JobPosting> => {
  const tableName = resolveJobsTable();
  const jobId = jobIdFromUrl(job.url);
  const scrapedAt = new Date().toISOString();

  const jobPosting: JobPosting = { ...job, jobId, scrapedAt };

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { PK: `JOB#${jobId}`, SK: 'META' },
        UpdateExpression:
          'SET jobId = :jobId, sourceSite = :sourceSite, title = :title, company = :company, ' +
          '#url = :url, rawDescription = :rawDescription, scrapedAt = :scrapedAt, ' +
          'gsi1pk = :gsi1pk, gsi1sk = :gsi1sk',
        ExpressionAttributeNames: { '#url': 'url' },
        ExpressionAttributeValues: {
          ':jobId': jobId,
          ':sourceSite': job.sourceSite,
          ':title': job.title,
          ':company': job.company,
          ':url': job.url,
          ':rawDescription': job.rawDescription,
          ':scrapedAt': scrapedAt,
          ':gsi1pk': `SOURCE#${job.sourceSite}`,
          ':gsi1sk': `SCRAPED#${scrapedAt}`,
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
  } catch (err) {
    throw new DatabaseError('Could not upsert job posting', err);
  }

  return jobPosting;
};
