import {
  loadDigestJobs,
  loadUnsentMatches,
  markMatchSent,
  saveRecipientStatus,
} from '@modules/emailModule/digestStore';
import type { MatchResult } from '@modules/schedulerModule/runUserPipeline/types';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockSend })) },
  QueryCommand: jest.fn().mockImplementation((input) => ({ input, type: 'Query' })),
  BatchGetCommand: jest.fn().mockImplementation((input) => ({ input, type: 'BatchGet' })),
  UpdateCommand: jest.fn().mockImplementation((input) => ({ input, type: 'Update' })),
}));

function mockSend(command: unknown) {
  return sendMock(command);
}

const conditionalFailure = () =>
  Object.assign(new Error('failed'), { name: 'ConditionalCheckFailedException' });

const match: MatchResult = {
  partitionKey: 'user-1#job-a',
  userId: 'user-1',
  jobId: 'job-a',
  matchScore: 80,
  reasoning: 'Fit',
  matchingSkills: ['TS'],
  evaluatedAt: '2025-01-01T00:00:00.000Z',
};

describe('digestStore', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.MATCHES_TABLE_NAME = 'matches';
    process.env.JOBS_TABLE_NAME = 'jobs';
    process.env.USERS_TABLE_NAME = 'users';
    sendMock.mockReset().mockResolvedValue({});
  });

  afterAll(() => {
    process.env = env;
  });

  describe('loadUnsentMatches (M3)', () => {
    it('queries the user GSI for qualifying matches with no sentAt, across pages', async () => {
      sendMock
        .mockResolvedValueOnce({
          Items: [{ ...match, PK: match.partitionKey, SK: 'MATCH', gsi1pk: 'USER#user-1' }],
          LastEvaluatedKey: { PK: 'x' },
        })
        .mockResolvedValueOnce({ Items: [{ ...match, jobId: 'job-b', partitionKey: 'user-1#job-b' }] });

      const result = await loadUnsentMatches('user-1');

      expect(result.map((m) => m.jobId)).toEqual(['job-a', 'job-b']);
      expect(result[0]).toEqual(match);
      expect(sendMock.mock.calls[0][0].input).toEqual({
        TableName: 'matches',
        IndexName: 'GSI1',
        KeyConditionExpression: 'gsi1pk = :pk',
        FilterExpression: 'attribute_not_exists(sentAt) AND matchScore >= :threshold',
        ExpressionAttributeValues: { ':pk': 'USER#user-1', ':threshold': 60 },
        ExclusiveStartKey: undefined,
      });
      expect(sendMock.mock.calls[1][0].input.ExclusiveStartKey).toEqual({ PK: 'x' });
    });
  });

  describe('loadDigestJobs', () => {
    it('returns nothing without a call for no ids', async () => {
      await expect(loadDigestJobs([])).resolves.toEqual({});
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('batch-reads job fields and retries unprocessed keys', async () => {
      sendMock
        .mockResolvedValueOnce({
          Responses: { jobs: [{ jobId: 'job-a', title: 'A', company: 'Acme', url: 'https://a' }] },
          UnprocessedKeys: { jobs: { Keys: [{ PK: 'JOB#job-b', SK: 'META' }] } },
        })
        .mockResolvedValueOnce({
          Responses: { jobs: [{ jobId: 'job-b', title: 'B', company: 'Beta', url: 'https://b' }] },
        });

      const jobs = await loadDigestJobs(['job-a', 'job-b', 'job-a']);

      expect(jobs).toEqual({
        'job-a': { title: 'A', company: 'Acme', url: 'https://a' },
        'job-b': { title: 'B', company: 'Beta', url: 'https://b' },
      });
      expect(sendMock.mock.calls[0][0].input.RequestItems.jobs.Keys).toEqual([
        { PK: 'JOB#job-a', SK: 'META' },
        { PK: 'JOB#job-b', SK: 'META' },
      ]);
      expect(sendMock.mock.calls[1][0].input.RequestItems.jobs.Keys).toEqual([
        { PK: 'JOB#job-b', SK: 'META' },
      ]);
    });
  });

  describe('markMatchSent', () => {
    it('sets sentAt only when it is not already set', async () => {
      await markMatchSent(match, '2025-02-01T00:00:00.000Z');

      expect(sendMock.mock.calls[0][0].input).toEqual({
        TableName: 'matches',
        Key: { PK: 'user-1#job-a', SK: 'MATCH' },
        UpdateExpression: 'SET sentAt = :sentAt',
        ConditionExpression: 'attribute_exists(PK) AND attribute_not_exists(sentAt)',
        ExpressionAttributeValues: { ':sentAt': '2025-02-01T00:00:00.000Z' },
      });
    });

    it('treats an existing stamp as done', async () => {
      sendMock.mockRejectedValueOnce(conditionalFailure());

      await expect(markMatchSent(match, 'now')).resolves.toBeUndefined();
    });

    it('throws other errors', async () => {
      sendMock.mockRejectedValueOnce(new Error('ddb down'));

      await expect(markMatchSent(match, 'now')).rejects.toThrow('ddb down');
    });
  });

  describe('saveRecipientStatus', () => {
    it('writes the status only while the email is unchanged', async () => {
      await saveRecipientStatus('user-1', 'user@example.com', 'VERIFIED');

      expect(sendMock.mock.calls[0][0].input).toEqual({
        TableName: 'users',
        Key: { userId: 'user-1' },
        UpdateExpression: 'SET emailVerificationStatus = :status',
        ConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':status': 'VERIFIED', ':email': 'user@example.com' },
      });
    });

    it('ignores a changed email', async () => {
      sendMock.mockRejectedValueOnce(conditionalFailure());

      await expect(saveRecipientStatus('user-1', 'old@example.com', 'VERIFIED')).resolves.toBeUndefined();
    });
  });
});
