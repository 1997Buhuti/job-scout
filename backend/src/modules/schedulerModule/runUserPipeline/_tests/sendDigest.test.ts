import { MATCH_SCORE_THRESHOLD, sendDigestForUser } from '@modules/schedulerModule/runUserPipeline/sendDigest';
import type { JobPosting, MatchResult } from '@modules/schedulerModule/runUserPipeline/types';

const sesSendMock = jest.fn();
const ddbSendMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockDdbSend })) },
  UpdateCommand: jest.fn().mockImplementation((input) => input),
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn().mockImplementation(() => ({ send: mockSesSend })),
  SendEmailCommand: jest.fn().mockImplementation((input) => input),
}));

// Function declarations (not const) so they're hoisted and available when
// the jest.mock factories above run during module resolution.
function mockDdbSend(command: unknown) {
  return ddbSendMock(command);
}
function mockSesSend(command: unknown) {
  return sesSendMock(command);
}

const job: JobPosting = {
  jobId: 'job-a',
  sourceSite: 'topjobs.lk',
  title: 'Software Engineer',
  company: 'Acme',
  url: 'https://example.com/a',
  rawDescription: 'Build and ship product features.',
  scrapedAt: '2024-01-01T00:00:00.000Z',
};

const buildMatch = (matchScore: number): MatchResult => ({
  partitionKey: `user-1#${job.jobId}`,
  userId: 'user-1',
  jobId: job.jobId,
  matchScore,
  reasoning: 'Good fit',
  matchingSkills: ['TypeScript'],
  evaluatedAt: '2024-01-01T00:00:00.000Z',
});

describe('sendDigestForUser', () => {
  const originalMatchesTable = process.env.MATCHES_TABLE_NAME;
  const originalFromAddress = process.env.SES_FROM_ADDRESS;

  beforeEach(() => {
    process.env.MATCHES_TABLE_NAME = 'job-scout-dev-matches';
    process.env.SES_FROM_ADDRESS = 'noreply@job-scout.example';
    sesSendMock.mockReset();
    ddbSendMock.mockReset();
    sesSendMock.mockResolvedValue({});
    ddbSendMock.mockResolvedValue({});
  });

  afterAll(() => {
    if (originalMatchesTable === undefined) {
      delete process.env.MATCHES_TABLE_NAME;
    } else {
      process.env.MATCHES_TABLE_NAME = originalMatchesTable;
    }
    if (originalFromAddress === undefined) {
      delete process.env.SES_FROM_ADDRESS;
    } else {
      process.env.SES_FROM_ADDRESS = originalFromAddress;
    }
  });

  it('skips SendEmailCommand entirely when zero matches qualify', async () => {
    const result = await sendDigestForUser('user@example.com', [buildMatch(MATCH_SCORE_THRESHOLD - 1)], {
      [job.jobId]: job,
    });

    expect(result).toEqual({ sent: false });
    expect(sesSendMock).not.toHaveBeenCalled();
    expect(ddbSendMock).not.toHaveBeenCalled();
  });

  it('sends once and sets sentAt via UpdateCommand for a qualifying match', async () => {
    const match = buildMatch(MATCH_SCORE_THRESHOLD);

    const result = await sendDigestForUser('user@example.com', [match], { [job.jobId]: job });

    expect(sesSendMock).toHaveBeenCalledTimes(1);
    const sentEmail = sesSendMock.mock.calls[0][0] as { Source: string; Destination: { ToAddresses: string[] } };
    expect(sentEmail.Source).toBe('noreply@job-scout.example');
    expect(sentEmail.Destination.ToAddresses).toEqual(['user@example.com']);

    expect(ddbSendMock).toHaveBeenCalledTimes(1);
    const sentUpdate = ddbSendMock.mock.calls[0][0] as {
      TableName: string;
      Key: Record<string, unknown>;
      ExpressionAttributeValues: Record<string, unknown>;
    };
    expect(sentUpdate.TableName).toBe('job-scout-dev-matches');
    expect(sentUpdate.Key).toEqual({ PK: match.partitionKey, SK: 'MATCH' });
    expect(sentUpdate.ExpressionAttributeValues[':sentAt']).toEqual(expect.any(String));

    expect(result).toEqual({ sent: true, matchIds: [job.jobId] });
  });
});
