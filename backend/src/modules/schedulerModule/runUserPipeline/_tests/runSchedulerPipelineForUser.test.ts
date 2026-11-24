import type { DeliverDigestResult } from '@modules/emailModule/deliverDigest';
import type { SchedulerPipelineUser } from '@modules/schedulerModule/runUserPipeline/runSchedulerPipelineForUser';
import { runSchedulerPipelineForUser } from '@modules/schedulerModule/runUserPipeline/runSchedulerPipelineForUser';
import type { JobPosting, MatchResult } from '@modules/schedulerModule/runUserPipeline/types';

// The default deliverDigest pulls in AWS clients; every test injects one.
jest.mock('@modules/emailModule/deliverDigest', () => ({ deliverDigest: jest.fn() }));

const buildJob = (jobId: string): JobPosting => ({
  jobId,
  sourceSite: 'topjobs.lk',
  title: 'Software Engineer',
  company: 'Acme',
  url: `https://example.com/${jobId}`,
  rawDescription: 'Build and ship product features.',
  scrapedAt: '2024-01-01T00:00:00.000Z',
});

const job = buildJob('job-a');

const user: SchedulerPipelineUser = {
  userId: 'user-1',
  email: 'user@example.com',
  targetRoles: ['Software Engineer'],
  scheduleIntervalDays: 7,
  schedulerEnabled: true,
  emailSuppressed: false,
  emailVerificationStatus: 'PENDING',
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

const expectedRecipient = {
  userId: 'user-1',
  email: 'user@example.com',
  schedulerEnabled: true,
  emailSuppressed: false,
  emailVerificationStatus: 'PENDING',
};

const buildDeps = (digest: DeliverDigestResult, jobs: JobPosting[] = [job]) => ({
  runUserPipeline: jest.fn().mockResolvedValue({ scraped: jobs.length, upserted: jobs }),
  loadExistingMatchIds: jest.fn().mockResolvedValue(new Set<string>()),
  evaluateJobsForUser: jest.fn(
    (_userId: string, _targetRoles: string[], remaining: JobPosting[]) =>
      Promise.resolve(remaining.some((j) => j.jobId === job.jobId) ? [match] : []),
  ),
  deliverDigest: jest.fn().mockResolvedValue(digest),
  advanceUserSchedule: jest
    .fn()
    .mockResolvedValue({ lastRunAt: '2024-01-01T00:00:00.000Z', nextRunAt: '2024-01-08T00:00:00.000Z' }),
});

describe('runSchedulerPipelineForUser', () => {
  it('B10: a second run never Bedrock-evaluates a jobId that already has a MatchResult', async () => {
    const deps = buildDeps({ status: 'sent', matchIds: [job.jobId] });

    await runSchedulerPipelineForUser(user, deps);

    expect(deps.evaluateJobsForUser).toHaveBeenCalledWith(user.userId, user.targetRoles, [job], undefined);
    expect(deps.deliverDigest).toHaveBeenCalledWith(
      expectedRecipient,
      [match],
      { [job.jobId]: job },
      undefined,
    );

    deps.evaluateJobsForUser.mockClear();
    deps.deliverDigest.mockClear();
    deps.loadExistingMatchIds.mockResolvedValue(new Set([job.jobId]));

    await runSchedulerPipelineForUser(user, deps);

    expect(deps.evaluateJobsForUser).toHaveBeenCalledWith(user.userId, user.targetRoles, [], undefined);
    // No new matches, but delivery still runs so older unsent ones go out.
    // The re-scraped job's details are passed along for that.
    expect(deps.deliverDigest).toHaveBeenCalledWith(
      expectedRecipient,
      [],
      { [job.jobId]: job },
      undefined,
    );
    expect(deps.advanceUserSchedule).toHaveBeenCalledTimes(2);
  });

  it.each<[string, DeliverDigestResult]>([
    ['recipient-unverified skip', { status: 'skipped', reason: 'recipient-unverified', matchIds: ['job-a'] }],
    ['sender-unverified skip', { status: 'skipped', reason: 'sender-unverified', matchIds: ['job-a'] }],
    ['permanent failure', { status: 'failed', reason: 'permanent', matchIds: ['job-a'], error: 'MessageRejected' }],
    ['retried-out transient failure', { status: 'failed', reason: 'transient', matchIds: ['job-a'], error: 'Throttling' }],
  ])('a %s completes the run and advances the schedule', async (_label, digest) => {
    const deps = buildDeps(digest);

    const result = await runSchedulerPipelineForUser(user, deps);

    expect(result.digest).toEqual(digest);
    expect(deps.advanceUserSchedule).toHaveBeenCalledWith(user.userId, user.scheduleIntervalDays);
    expect(result).toMatchObject({
      scraped: 1,
      evaluated: 1,
      lastRunAt: '2024-01-01T00:00:00.000Z',
      nextRunAt: '2024-01-08T00:00:00.000Z',
    });
  });

  it('passes every scraped job to delivery, including already-evaluated ones', async () => {
    const other = buildJob('job-b');
    const deps = buildDeps({ status: 'sent', matchIds: ['job-a'] }, [job, other]);
    deps.loadExistingMatchIds.mockResolvedValue(new Set(['job-b']));

    await runSchedulerPipelineForUser(user, deps);

    expect(deps.deliverDigest.mock.calls[0][2]).toEqual({ 'job-a': job, 'job-b': other });
  });

  it('does not advance the schedule when a step before delivery fails', async () => {
    const deps = buildDeps({ status: 'sent', matchIds: [] });
    deps.evaluateJobsForUser.mockRejectedValueOnce(new Error('Bedrock down'));

    await expect(runSchedulerPipelineForUser(user, deps)).rejects.toThrow('Bedrock down');
    expect(deps.deliverDigest).not.toHaveBeenCalled();
    expect(deps.advanceUserSchedule).not.toHaveBeenCalled();
  });
});
