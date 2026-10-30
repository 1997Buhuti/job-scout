import { jobIdFromUrl } from '@modules/schedulerModule/runUserPipeline/jobId';
import type { ScrapedJob } from '@modules/schedulerModule/runUserPipeline/types';
import { upsertJobPosting } from '@modules/schedulerModule/runUserPipeline/upsertJobPosting';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send: mockSend })) },
  UpdateCommand: jest.fn().mockImplementation((input) => input),
}));

// Function declaration (not const) so it's hoisted and available when the
// jest.mock factory above runs during module resolution.
function mockSend(command: unknown) {
  return sendMock(command);
}

const job: ScrapedJob = {
  sourceSite: 'topjobs.lk',
  title: 'Software Engineer',
  company: 'Acme Lanka (Pvt) Ltd',
  url: 'https://www.topjobs.lk/jobs/software-engineer-123',
  rawDescription: 'Build and ship product features.',
};

describe('upsertJobPosting', () => {
  const originalJobsTable = process.env.JOBS_TABLE_NAME;

  beforeEach(() => {
    process.env.JOBS_TABLE_NAME = 'job-scout-dev-jobs';
    sendMock.mockReset();
    sendMock.mockResolvedValue({});
  });

  afterAll(() => {
    if (originalJobsTable === undefined) {
      delete process.env.JOBS_TABLE_NAME;
    } else {
      process.env.JOBS_TABLE_NAME = originalJobsTable;
    }
  });

  it('sends an UpdateCommand keyed by the URL-hash jobId', async () => {
    const result = await upsertJobPosting(job);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as { TableName: string; Key: Record<string, unknown> };

    const expectedJobId = jobIdFromUrl(job.url);
    expect(sent.TableName).toBe('job-scout-dev-jobs');
    expect(sent.Key).toEqual({ PK: `JOB#${expectedJobId}`, SK: 'META' });
    expect(result.jobId).toBe(expectedJobId);
    expect(result.title).toBe(job.title);
  });

  it('upserts (same Key both times) rather than creating a duplicate when called twice for the same URL', async () => {
    await upsertJobPosting(job);
    await upsertJobPosting({ ...job, title: 'Software Engineer II' });

    expect(sendMock).toHaveBeenCalledTimes(2);
    const firstKey = (sendMock.mock.calls[0][0] as { Key: Record<string, unknown> }).Key;
    const secondKey = (sendMock.mock.calls[1][0] as { Key: Record<string, unknown> }).Key;
    expect(firstKey).toEqual(secondKey);
  });

  it('throws DatabaseError when the DynamoDB call fails', async () => {
    sendMock.mockRejectedValue(new Error('ProvisionedThroughputExceeded'));

    await expect(upsertJobPosting(job)).rejects.toMatchObject({ statusCode: 500, code: 'DATABASE_ERROR' });
  });

  it('fails loudly when JOBS_TABLE_NAME is not configured', async () => {
    delete process.env.JOBS_TABLE_NAME;

    await expect(upsertJobPosting(job)).rejects.toThrow('JOBS_TABLE_NAME');
  });
});
