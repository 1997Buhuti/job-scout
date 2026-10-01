/**
 * DynamoDB users table for UserProfile (feature 03-auth-profile).
 * Keys: PK = USER#{userId}, SK = PROFILE. GSI1 deferred to 02-job-scheduler.
 */
export const usersTableResources = {
  Resources: {
    UsersTable: {
      Type: 'AWS::DynamoDB::Table',
      Properties: {
        TableName: 'job-scout-${sls:stage}-users',
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
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
} as const;
