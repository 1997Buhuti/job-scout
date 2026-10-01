import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});

/** Shared Document Client for Lambda handlers (AWS SDK v3). */
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const getUsersTableName = (): string => {
  const tableName = process.env.USERS_TABLE_NAME;
  if (!tableName) {
    throw new Error('USERS_TABLE_NAME is not configured');
  }
  return tableName;
};
