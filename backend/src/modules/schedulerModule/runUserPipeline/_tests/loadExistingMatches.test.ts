import {
  dedupeByJobId,
  loadExistingMatchIds,
} from '@modules/schedulerModule/runUserPipeline/loadExistingMatches';
import type { JobPosting } from '@modules/schedulerModule/runUserPipeline/types';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockSend })) },
  BatchGetCommand: jest.fn().mockImplementation((input) => input),
}));

// Function declaration (not const) so it's hoisted and available when the
// jest.mock factory above runs during module resolution.
function mockSend(command: unknown) {
  return sendMock(command);
}

const buildJob = (jobId: string, url: string): JobPosting => ({
  jobId,
  sourceSite: 'topjobs.lk',
  title: 'Software Engineer',
  company: 'Acme',
  url,
  rawDescription: 'desc',
  scrapedAt: '2024-01-01T00:00:00.000Z',
});

describe('loadExistingMatchIds', () => {
  const originalMatchesTable = process.env.MATCHES_TABLE_NAME;

  beforeEach(() => {
    process.env.MATCHES_TABLE_NAME = 'job-scout-dev-matches';
    sendMock.mockReset();
  });

  afterAll(() => {
    if (originalMatchesTable === undefined) {
      delete process.env.MATCHES_TABLE_NAME;
    } else {
      process.env.MATCHES_TABLE_NAME = originalMatchesTable;
    }
  });

  it('returns an empty set without calling DynamoDB when jobIds is empty', async () => {
    const result = await loadExistingMatchIds('user-1', []);

    expect(result).toEqual(new Set());
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('detects already-matched jobIds from the BatchGetCommand response', async () => {
    sendMock.mockResolvedValue({
      Responses: {
        'job-scout-dev-matches': [
          { PK: 'user-1#job-a', SK: 'MATCH', jobId: 'job-a', userId: 'user-1' },
        ],
      },
    });

    const result = await loadExistingMatchIds('user-1', ['job-a', 'job-b']);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as {
      RequestItems: Record<string, { Keys: Array<Record<string, unknown>> }>;
    };
    expect(sent.RequestItems['job-scout-dev-matches'].Keys).toEqual([
      { PK: 'user-1#job-a', SK: 'MATCH' },
      { PK: 'user-1#job-b', SK: 'MATCH' },
    ]);
    expect(result).toEqual(new Set(['job-a']));
  });

  it('chunks more than 100 keys into multiple BatchGetCommand calls', async () => {
    sendMock.mockResolvedValue({ Responses: { 'job-scout-dev-matches': [] } });

    const jobIds = Array.from({ length: 150 }, (_, i) => `job-${i}`);
    await loadExistingMatchIds('user-1', jobIds);

    expect(sendMock).toHaveBeenCalledTimes(2);
    const firstCall = sendMock.mock.calls[0][0] as {
      RequestItems: Record<string, { Keys: Array<Record<string, unknown>> }>;
    };
    const secondCall = sendMock.mock.calls[1][0] as {
      RequestItems: Record<string, { Keys: Array<Record<string, unknown>> }>;
    };
    expect(firstCall.RequestItems['job-scout-dev-matches'].Keys).toHaveLength(100);
    expect(secondCall.RequestItems['job-scout-dev-matches'].Keys).toHaveLength(50);
  });

  it('fails loudly when MATCHES_TABLE_NAME is not configured', async () => {
    delete process.env.MATCHES_TABLE_NAME;

    await expect(loadExistingMatchIds('user-1', ['job-a'])).rejects.toThrow('MATCHES_TABLE_NAME');
  });
});

describe('dedupeByJobId', () => {
  it('keeps the first occurrence of each jobId', () => {
    const jobA = buildJob('job-a', 'https://example.com/a');
    const jobADuplicate = buildJob('job-a', 'https://example.com/a-rescraped');
    const jobB = buildJob('job-b', 'https://example.com/b');

    const result = dedupeByJobId([jobA, jobADuplicate, jobB]);

    expect(result).toEqual([jobA, jobB]);
  });

  it('returns an empty array for an empty input', () => {
    expect(dedupeByJobId([])).toEqual([]);
  });
});
