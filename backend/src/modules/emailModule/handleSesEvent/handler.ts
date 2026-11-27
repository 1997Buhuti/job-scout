import type { SNSEvent } from 'aws-lambda';
import { Logger } from '@common/logger';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SES_SERVICE } from '@common/constants';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const logger = new Logger(SES_SERVICE);

interface SesNotification {
  notificationType: 'Bounce' | 'Complaint' | 'Delivery' | 'Send';
  mail: {
    destination: string[];
    messageId: string;
    timestamp: string;
  };
}

interface SesBounceNotification extends SesNotification {
  notificationType: 'Bounce';
  bounce: {
    bounceType: 'Permanent' | 'Transient' | 'Undetermined';
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      status?: string;
      action?: string;
      diagnosticCode?: string;
    }>;
    timestamp: string;
    feedbackId: string;
    reportingMTA?: string;
  };
}

interface SesComplaintNotification extends SesNotification {
  notificationType: 'Complaint';
  complaint: {
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    timestamp: string;
    feedbackId: string;
    complaintFeedbackType?: string;
    arrivalDate?: string;
  };
}

interface SesOtherNotification extends SesNotification {
  notificationType: 'Delivery' | 'Send';
}

type SesEvent = SesBounceNotification | SesComplaintNotification | SesOtherNotification;

/**
 * E3: Handle SES bounce/complaint events.
 * 
 * On a permanent bounce or complaint, sets emailSuppressed = true,
 * emailSuppressedReason = 'BOUNCE' | 'COMPLAINT', and emailSuppressedAt.
 * Ignores transient bounces.
 * 
 * @param event SNS event containing SES notification
 */
export const main = async (event: SNSEvent): Promise<void> => {
  try {
    logger.info({ message: 'Received SES event', data: { event } });

    // SNS event contains SES notification in the message
    const snsMessage = event.Records[0].Sns.Message;
    const sesEvent: SesEvent = JSON.parse(snsMessage);

    logger.info({
      message: 'Parsed SES event',
      data: {
        notificationType: sesEvent.notificationType,
        messageId: sesEvent.mail.messageId,
      },
    });

    if (sesEvent.notificationType === 'Bounce') {
      await handleBounce(sesEvent);
    } else if (sesEvent.notificationType === 'Complaint') {
      await handleComplaint(sesEvent);
    } else {
      logger.info({
        message: 'Ignoring non-bounce/complaint SES event',
        data: { notificationType: sesEvent.notificationType },
      });
    }
  } catch (error) {
    logger.error(error, 'Failed to process SES event');
    throw error;
  }
};

/**
 * Handle bounce notification.
 * Only permanent bounces suppress the email; transient bounces are logged and ignored.
 */
const handleBounce = async (event: SesBounceNotification): Promise<void> => {
  const { bounceType, bouncedRecipients } = event.bounce;
  
  if (bounceType !== 'Permanent') {
    logger.info({
      message: 'Ignoring transient bounce',
      data: {
        bounceType,
        bounceSubType: event.bounce.bounceSubType,
        messageId: event.mail.messageId,
      },
    });
    return;
  }

  logger.warn({
    message: 'Processing permanent bounce',
    data: {
      bounceType,
      bounceSubType: event.bounce.bounceSubType,
      bouncedRecipients: bouncedRecipients.length,
    },
  });

  for (const recipient of bouncedRecipients) {
    await suppressEmail(
      recipient.emailAddress,
      'BOUNCE',
      event.bounce.timestamp,
      `Bounce: ${event.bounce.bounceSubType}${recipient.diagnosticCode ? ` (${recipient.diagnosticCode})` : ''}`
    );
  }
};

/**
 * Handle complaint notification.
 * All complaints suppress the email.
 */
const handleComplaint = async (event: SesComplaintNotification): Promise<void> => {
  const { complainedRecipients } = event.complaint;
  
  logger.warn({
    message: 'Processing complaint',
    data: {
      complaintFeedbackType: event.complaint.complaintFeedbackType,
      complainedRecipients: complainedRecipients.length,
    },
  });

  for (const recipient of complainedRecipients) {
    await suppressEmail(
      recipient.emailAddress,
      'COMPLAINT',
      event.complaint.timestamp,
      `Complaint: ${event.complaint.complaintFeedbackType || 'unspecified'}`
    );
  }
};

/**
 * Update user profile to suppress email.
 * Uses the EmailIndex GSI to find user by email address.
 */
const suppressEmail = async (
  email: string,
  reason: 'BOUNCE' | 'COMPLAINT',
  timestamp: string,
  details: string
): Promise<void> => {
  try {
    logger.info({ message: 'Looking up user by email', data: { email } });
    
    // Query UsersTable using EmailIndex GSI to find user by email
    const queryCommand = new QueryCommand({
      TableName: process.env.USERS_TABLE_NAME,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email,
      },
      Limit: 1,
    });
    
    const queryResult = await docClient.send(queryCommand);
    
    if (!queryResult.Items || queryResult.Items.length === 0) {
      logger.warn({ message: 'No user found for email', data: { email } });
      return;
    }
    
    const user = queryResult.Items[0];
    const userId = user.userId;
    
    logger.info({
      message: 'Found user, updating suppression status',
      data: { userId, email, reason },
    });
    
    // Update user record with suppression fields
    const updateCommand = new UpdateCommand({
      TableName: process.env.USERS_TABLE_NAME,
      Key: { userId },
      UpdateExpression: 'SET emailSuppressed = :suppressed, emailSuppressedReason = :reason, emailSuppressedAt = :timestamp, #updated = :updated',
      ExpressionAttributeNames: {
        '#updated': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':suppressed': true,
        ':reason': reason,
        ':timestamp': timestamp,
        ':updated': new Date().toISOString(),
      },
      ReturnValues: 'NONE',
    });
    
    await docClient.send(updateCommand);
    
    logger.info({
      message: 'Successfully suppressed email',
      data: { userId, email, reason, timestamp, details },
    });
  } catch (error) {
    logger.error(error, `Failed to suppress email (${reason}) for ${email}`);
    throw error;
  }
};