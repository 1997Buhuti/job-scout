import type { SNSEvent } from 'aws-lambda';
import { main } from '../handler';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

// Mock the DynamoDB Document Client
const ddbMock = mockClient(DynamoDBDocumentClient);

// Mock logger to avoid console output during tests
jest.mock('@common/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock environment variable
process.env.USERS_TABLE_NAME = 'test-users-table';

describe('handleSesEvent', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('permanent bounce', () => {
    it('should suppress email for permanent bounce', async () => {
      const event = {
        Records: [
          {
            Sns: {
              Message: JSON.stringify({
                notificationType: 'Bounce',
                mail: {
                  destination: ['user@example.com'],
                  messageId: 'test-message-id',
                  timestamp: '2024-01-01T00:00:00Z',
                },
                bounce: {
                  bounceType: 'Permanent',
                  bounceSubType: 'General',
                  bouncedRecipients: [
                    {
                      emailAddress: 'user@example.com',
                      status: '5.0.0',
                      action: 'failed',
                      diagnosticCode: 'smtp; 550 user unknown',
                    },
                  ],
                  timestamp: '2024-01-01T00:00:00Z',
                  feedbackId: 'test-feedback-id',
                },
              }),
            },
          },
        ],
      };

      // Mock query to find user by email
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            userId: 'test-user-id',
            email: 'user@example.com',
          },
        ],
      });

      // Mock update to suppress email
      ddbMock.on(UpdateCommand).resolves({});

      await main(event as unknown as SNSEvent);

      // Verify query was called with correct parameters
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(1);
      const queryCall = ddbMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input).toEqual({
        TableName: 'test-users-table',
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': 'user@example.com',
        },
        Limit: 1,
      });

      // Verify update was called with correct parameters
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
      const updateCall = ddbMock.commandCalls(UpdateCommand)[0];
      expect(updateCall.args[0].input.Key).toEqual({ userId: 'test-user-id' });
      expect(updateCall.args[0].input.UpdateExpression).toContain('emailSuppressed = :suppressed');
      expect(updateCall.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':suppressed': true,
        ':reason': 'BOUNCE',
      });
    });

    it('should ignore transient bounce', async () => {
      const event = {
        Records: [
          {
            Sns: {
              Message: JSON.stringify({
                notificationType: 'Bounce',
                mail: {
                  destination: ['user@example.com'],
                  messageId: 'test-message-id',
                  timestamp: '2024-01-01T00:00:00Z',
                },
                bounce: {
                  bounceType: 'Transient',
                  bounceSubType: 'General',
                  bouncedRecipients: [
                    {
                      emailAddress: 'user@example.com',
                    },
                  ],
                  timestamp: '2024-01-01T00:00:00Z',
                  feedbackId: 'test-feedback-id',
                },
              }),
            },
          },
        ],
      };

      await main(event as unknown as SNSEvent);

      // Verify no DynamoDB calls were made for transient bounce
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(0);
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    });
  });

  describe('complaint', () => {
    it('should suppress email for complaint', async () => {
      const event = {
        Records: [
          {
            Sns: {
              Message: JSON.stringify({
                notificationType: 'Complaint',
                mail: {
                  destination: ['user@example.com'],
                  messageId: 'test-message-id',
                  timestamp: '2024-01-01T00:00:00Z',
                },
                complaint: {
                  complainedRecipients: [
                    {
                      emailAddress: 'user@example.com',
                    },
                  ],
                  timestamp: '2024-01-01T00:00:00Z',
                  feedbackId: 'test-feedback-id',
                  complaintFeedbackType: 'abuse',
                },
              }),
            },
          },
        ],
      };

      // Mock query to find user by email
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            userId: 'test-user-id',
            email: 'user@example.com',
          },
        ],
      });

      // Mock update to suppress email
      ddbMock.on(UpdateCommand).resolves({});

      await main(event as unknown as SNSEvent);

      // Verify query was called
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(1);

      // Verify update was called with complaint reason
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(1);
      const updateCall = ddbMock.commandCalls(UpdateCommand)[0];
      expect(updateCall.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':reason': 'COMPLAINT',
      });
    });
  });

  describe('other notification types', () => {
    it('should ignore delivery notifications', async () => {
      const event = {
        Records: [
          {
            Sns: {
              Message: JSON.stringify({
                notificationType: 'Delivery',
                mail: {
                  destination: ['user@example.com'],
                  messageId: 'test-message-id',
                  timestamp: '2024-01-01T00:00:00Z',
                },
                delivery: {
                  timestamp: '2024-01-01T00:00:00Z',
                  processingTimeMillis: 1000,
                  recipients: ['user@example.com'],
                  smtpResponse: '250 2.6.0 Message received',
                },
              }),
            },
          },
        ],
      };

      await main(event as unknown as SNSEvent);

      // Verify no DynamoDB calls were made
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(0);
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    });

    it('should ignore send notifications', async () => {
      const event = {
        Records: [
          {
            Sns: {
              Message: JSON.stringify({
                notificationType: 'Send',
                mail: {
                  destination: ['user@example.com'],
                  messageId: 'test-message-id',
                  timestamp: '2024-01-01T00:00:00Z',
                },
                send: {},
              }),
            },
          },
        ],
      };

      await main(event as unknown as SNSEvent);

      // Verify no DynamoDB calls were made
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(0);
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should handle user not found gracefully', async () => {
      const event = {
        Records: [
          {
            Sns: {
              Message: JSON.stringify({
                notificationType: 'Complaint',
                mail: {
                  destination: ['unknown@example.com'],
                  messageId: 'test-message-id',
                  timestamp: '2024-01-01T00:00:00Z',
                },
                complaint: {
                  complainedRecipients: [
                    {
                      emailAddress: 'unknown@example.com',
                    },
                  ],
                  timestamp: '2024-01-01T00:00:00Z',
                  feedbackId: 'test-feedback-id',
                },
              }),
            },
          },
        ],
      };

      // Mock query to return no users
      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });

      await main(event as unknown as SNSEvent);

      // Verify query was called but no update
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(1);
      expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    });

    it('should throw error for invalid JSON', async () => {
      const event = {
        Records: [
          {
            Sns: {
              Message: 'invalid json',
            },
          },
        ],
      };

      await expect(main(event as unknown as SNSEvent)).rejects.toThrow();
    });
  });
});