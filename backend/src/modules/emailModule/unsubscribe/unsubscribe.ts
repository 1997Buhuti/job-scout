import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { UNSUBSCRIBE_SERVICE } from '@common/constants';
import { DatabaseError } from '@common/ErrorTypes';
import { Logger } from '@common/logger';

import { verifyUnsubscribeToken } from '@modules/emailModule/unsubscribeToken/unsubscribeToken';

const USERS_TABLE_ENV_KEY = 'USERS_TABLE_NAME';

const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const logger = new Logger(UNSUBSCRIBE_SERVICE);

const resolveUsersTable = (): string => {
  const tableName = process.env[USERS_TABLE_ENV_KEY];
  if (!tableName) {
    throw new DatabaseError(`Missing required environment variable ${USERS_TABLE_ENV_KEY}`);
  }
  return tableName;
};

const getSigningSecret = (): string => {
  const secret = process.env.UNSUBSCRIBE_SIGNING_SECRET;
  if (!secret) {
    throw new DatabaseError('Missing required environment variable UNSUBSCRIBE_SIGNING_SECRET');
  }
  return secret;
};

export interface UnsubscribeRequest {
  token: string;
}

export interface UnsubscribeResponse {
  success: boolean;
  message: string;
}

/**
 * U3: unsubscribe endpoint logic. A valid token sets `schedulerEnabled` to `false`
 * and returns a confirmation page. An invalid or expired token returns an error page.
 */
export const unsubscribe = async (
  req: UnsubscribeRequest,
): Promise<UnsubscribeResponse> => {
  const tableName = resolveUsersTable();
  const signingSecret = getSigningSecret();

  const payload = verifyUnsubscribeToken(req.token, signingSecret);
  if (!payload) {
    logger.info({ message: 'Unsubscribe failed: invalid or expired token' });
    return {
      success: false,
      message: 'The unsubscribe link is invalid or has expired.',
    };
  }

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { userId: payload.userId },
        UpdateExpression: 'SET schedulerEnabled = :disabled',
        ExpressionAttributeValues: { ':disabled': false },
        ConditionExpression: 'attribute_exists(userId)',
      }),
    );

    logger.info({
      message: 'User unsubscribed successfully',
      data: { userId: payload.userId },
    });
    return {
      success: true,
      message: 'You have been unsubscribed from job alerts. You will no longer receive digest emails.',
    };
  } catch (err) {
    logger.error(err, `Failed to update subscription for user ${payload.userId}`);
    return {
      success: false,
      message: 'Could not process your unsubscribe request. Please try again later.',
    };
  }
};
