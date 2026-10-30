import { AWS } from '@serverless/typescript';

/**
 * Jobs table for `JobPosting` (B5 scrape + upsert step).
 *
 * Mirrors `UsersTable` in `cv-bucket.ts`: on-demand billing, one GSI.
 * `PK = JOB#{jobId}`, `SK = META`; `GSI1` (`gsi1pk = SOURCE#{sourceSite}`,
 * `gsi1sk = SCRAPED#{scrapedAt}`) lists recent jobs per portal — see
 * `specs/02-database-schema.md` §2.
 */
export const getJobsTableResources = (): AWS['resources'] => ({
  Resources: {
    JobsTable: {
      Type: 'AWS::DynamoDB::Table',
      Properties: {
        TableName: 'job-scout-${sls:stage}-jobs',
        AttributeDefinitions: [
          {
            AttributeName: 'PK',
            AttributeType: 'S',
          },
          {
            AttributeName: 'SK',
            AttributeType: 'S',
          },
          {
            AttributeName: 'gsi1pk',
            AttributeType: 'S',
          },
          {
            AttributeName: 'gsi1sk',
            AttributeType: 'S',
          },
        ],
        KeySchema: [
          {
            AttributeName: 'PK',
            KeyType: 'HASH',
          },
          {
            AttributeName: 'SK',
            KeyType: 'RANGE',
          },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'GSI1',
            KeySchema: [
              {
                AttributeName: 'gsi1pk',
                KeyType: 'HASH',
              },
              {
                AttributeName: 'gsi1sk',
                KeyType: 'RANGE',
              },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      },
    },
  },
  Outputs: {
    JobsTableName: {
      Description: 'DynamoDB jobs table name (JobPosting)',
      Value: { Ref: 'JobsTable' },
      Export: {
        Name: 'job-scout-${sls:stage}-JobsTableName',
      },
    },
  },
});
