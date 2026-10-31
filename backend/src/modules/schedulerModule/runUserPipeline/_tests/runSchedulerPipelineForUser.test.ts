import { runSchedulerPipelineForUser } from '@modules/schedulerModule/runUserPipeline/runSchedulerPipelineForUser';
import type { JobPosting, MatchResult } from '@modules/schedulerModule/runUserPipeline/types';

const job: JobPosting = {
  jobId: 'job-a',
  sourceSite: 'topjobs.lk',
  title: 'Software Engineer',
  company: 'Acme',
  url: 'https://example.com/a',
  rawDescription: 'Build and ship product features.',
  scrapedAt: '2024-01-01T00:00:00.000Z',
};

const user = {
  userId: 'user-1',
  email: 'user@example.com',
  targetRoles: ['Software Engineer'],
  scheduleIntervalDays: 7,
};

const match: MatchResult = {
  partitionKey: `${user.userId}#${job.jobId}`,
  userId: user.userId,
  jobId: job.jobId,
  matchScore: 82,
  reasoning: 'Strong fit',
  matchingSkills: ['TypeScript'],
  evaluatedAt: '2024-01-01T00:00:00.000Z',
};

describe('runSchedulerPipelineForUser', () => {
  it('B10: a second run never Bedrock-evaluates or SES-digests a jobId that already has a MatchResult', async () => {
    const runUserPipelineMock = jest.fn().mockResolvedValue({ scraped: 1, upserted: [job] });
    const evaluateJobsForUserMock = jest.fn(
      (_userId: string, _targetRoles: string[], jobs: JobPosting[]) =>
        Promise.resolve(jobs.length > 0 ? [match] : []),
    );
    const sendDigestForUserMock = jest.fn().mockResolvedValue({ sent: true, matchIds: [job.jobId] });
    const advanceUserScheduleMock = jest
      .fn()
      .mockResolvedValue({ lastRunAt: '2024-01-01T00:00:00.000Z', nextRunAt: '2024-01-08T00:00:00.000Z' });

    // Run 1: nothing matched yet.
    const loadExistingMatchIdsRun1 = jest.fn().mockResolvedValue(new Set<string>());

    await runSchedulerPipelineForUser(user, {
      runUserPipeline: runUserPipelineMock,
      loadExistingMatchIds: loadExistingMatchIdsRun1,
      evaluateJobsForUser: evaluateJobsForUserMock,
      sendDigestForUser: sendDigestForUserMock,
      advanceUserSchedule: advanceUserScheduleMock,
    });

    expect(evaluateJobsForUserMock).toHaveBeenCalledWith(user.userId, user.targetRoles, [job], undefined);
    expect(sendDigestForUserMock).toHaveBeenCalledWith(
      user.email,
      [match],
      { [job.jobId]: job },
      undefined,
    );

    evaluateJobsForUserMock.mockClear();
    sendDigestForUserMock.mockClear();

    // Run 2: job-a already has a MatchResult from run 1 (B6 omit-already-suggested).
    const loadExistingMatchIdsRun2 = jest.fn().mockResolvedValue(new Set([job.jobId]));

    await runSchedulerPipelineForUser(user, {
      runUserPipeline: runUserPipelineMock,
      loadExistingMatchIds: loadExistingMatchIdsRun2,
      evaluateJobsForUser: evaluateJobsForUserMock,
      sendDigestForUser: sendDigestForUserMock,
      advanceUserSchedule: advanceUserScheduleMock,
    });

    expect(evaluateJobsForUserMock).toHaveBeenCalledWith(user.userId, user.targetRoles, [], undefined);
    const run2EvaluateArgs = evaluateJobsForUserMock.mock.calls[0];
    expect(run2EvaluateArgs[2]).not.toContainEqual(expect.objectContaining({ jobId: job.jobId }));

    expect(sendDigestForUserMock).toHaveBeenCalledWith(user.email, [], {}, undefined);

    // advanceUserSchedule (B9) still runs on both successful completions,
    // even with zero new matches on run 2.
    expect(advanceUserScheduleMock).toHaveBeenCalledTimes(2);
  });
});
