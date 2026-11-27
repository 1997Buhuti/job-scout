import { AWS } from '@serverless/typescript';

/**
 * Users table for `UserProfile` (P1 create/read/update).
 *
 * Primary key: `userId` (string)
 * GSI1: `gsi1pk = SCHED#{schedulerEnabled}`, `gsi1sk = NEXT#{nextRunAt}` for
 *       the scheduler dispatcher
 * EmailIndex: `email` (hash only) for bounce/complaint lookups (E2/E3)
 *
 * CloudFormation (and DynamoDB UpdateTable) allow only ONE global secondary
 * index to be created or deleted per stack update. Add further indexes in
 * separate deployments, or the update fails and rolls back.
 */
export const getUsersTableResources = (): AWS['resources'] => ({
  Resources: {
    UsersTable: {
      Type: 'AWS::DynamoDB::Table',
      Properties: {
        TableName: 'job-scout-${sls:stage}-users',
        // Every attribute listed here must be used by a table or index key
        // schema, otherwise the stack update is rejected.
        AttributeDefinitions: [
          {
            AttributeName: 'userId',
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
          {
            AttributeName: 'email',
            AttributeType: 'S',
          },
        ],
        KeySchema: [
          {
            AttributeName: 'userId',
            KeyType: 'HASH',
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
          // E2: look up a user by email address.
          {
            IndexName: 'EmailIndex',
            KeySchema: [
              {
                AttributeName: 'email',
                KeyType: 'HASH',
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
    UsersTableName: {
      Description: 'DynamoDB users table name (UserProfile)',
      Value: { Ref: 'UsersTable' },
      Export: {
        Name: 'job-scout-${sls:stage}-UsersTableName',
      },
    },
  },
});
