import { evaluateJobsForUser } from '@modules/schedulerModule/runUserPipeline/evaluateJobs';
import type { JobPosting } from '@modules/schedulerModule/runUserPipeline/types';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockSend })) },
  PutCommand: jest.fn().mockImplementation((input) => input),
}));

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({})),
  InvokeModelCommand: jest.fn().mockImplementation((input) => input),
}));

// Function declaration (not const) so it's hoisted and available when the
// jest.mock factory above runs during module resolution.
function mockSend(command: unknown) {
  return sendMock(command);
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

describe('evaluateJobsForUser', () => {
  const originalMatchesTable = process.env.MATCHES_TABLE_NAME;

  beforeEach(() => {
    process.env.MATCHES_TABLE_NAME = 'job-scout-dev-matches';
    sendMock.mockReset();
    sendMock.mockResolvedValue({});
  });

  afterAll(() => {
    if (originalMatchesTable === undefined) {
      delete process.env.MATCHES_TABLE_NAME;
    } else {
      process.env.MATCHES_TABLE_NAME = originalMatchesTable;
    }
  });

  it('persists a MatchResult for a successfully parsed evaluation', async () => {
    const invokeBedrock = jest
      .fn()
      .mockResolvedValue(
        JSON.stringify({ matchScore: 82, reasoning: 'Strong fit', matchingSkills: ['TypeScript'] }),
      );

    const results = await evaluateJobsForUser('user-1', ['Software Engineer'], [job], { invokeBedrock });

    expect(invokeBedrock).toHaveBeenCalledWith(job, ['Software Engineer']);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      partitionKey: 'user-1#job-a',
      userId: 'user-1',
      jobId: 'job-a',
      matchScore: 82,
      reasoning: 'Strong fit',
      matchingSkills: ['TypeScript'],
    });
    expect(results[0].sentAt).toBeUndefined();

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as { TableName: string; Item: Record<string, unknown> };
    expect(sent.TableName).toBe('job-scout-dev-matches');
    expect(sent.Item).toMatchObject({
      PK: 'user-1#job-a',
      SK: 'MATCH',
      gsi1pk: 'USER#user-1',
      gsi1sk: 'SCORE#82#job-a',
    });
  });

  it('skips a job without throwing when the Bedrock response is malformed JSON', async () => {
    const invokeBedrock = jest.fn().mockResolvedValue('not json');

    const results = await evaluateJobsForUser('user-1', ['Software Engineer'], [job], { invokeBedrock });

    expect(results).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('skips a job without throwing when the parsed JSON is missing required fields', async () => {
    const invokeBedrock = jest.fn().mockResolvedValue(JSON.stringify({ matchScore: 82 }));

    const results = await evaluateJobsForUser('user-1', ['Software Engineer'], [job], { invokeBedrock });

    expect(results).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
