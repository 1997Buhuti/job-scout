import { AWS } from '@serverless/typescript';

/**
 * Matches table for `MatchResult` (B6–B10 match/digest steps).
 *
 * Mirrors `JobsTable` in `jobs-table.ts`: on-demand billing, one GSI.
 * `PK = {userId}#{jobId}`, `SK = MATCH`; `GSI1` (`gsi1pk = USER#{userId}`,
 * `gsi1sk = SCORE#{matchScore}#{jobId}`) ranks a user's matches for the
 * digest step — see `specs/02-database-schema.md` §3.
 */
export const getMatchesTableResources = (): AWS['resources'] => ({
  Resources: {
    MatchesTable: {
      Type: 'AWS::DynamoDB::Table',
      Properties: {
        TableName: 'job-scout-${sls:stage}-matches',
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
    MatchesTableName: {
      Description: 'DynamoDB matches table name (MatchResult)',
      Value: { Ref: 'MatchesTable' },
      Export: {
        Name: 'job-scout-${sls:stage}-MatchesTableName',
      },
    },
  },
});
