import type {
  DeliverDigestDeps,
  DeliverDigestResult,
  DigestRecipient,
} from '@modules/emailModule/deliverDigest';
import { deliverDigest } from '@modules/emailModule/deliverDigest';

import type { AdvanceScheduleResult } from './advanceSchedule';
import { advanceUserSchedule } from './advanceSchedule';
import type { EvaluateJobsDeps } from './evaluateJobs';
import { evaluateJobsForUser } from './evaluateJobs';
import { dedupeByJobId, loadExistingMatchIds } from './loadExistingMatches';
import type { RunUserPipelineDeps } from './runUserPipeline';
import { runUserPipeline } from './runUserPipeline';
import type { JobPosting } from './types';

export interface SchedulerPipelineUser extends DigestRecipient {
  targetRoles: string[];
  scheduleIntervalDays: number;
}

export interface RunSchedulerPipelineDeps {
  runUserPipeline?: typeof runUserPipeline;
  runUserPipelineDeps?: RunUserPipelineDeps;
  dedupeByJobId?: typeof dedupeByJobId;
  loadExistingMatchIds?: typeof loadExistingMatchIds;
  evaluateJobsForUser?: typeof evaluateJobsForUser;
  evaluateJobsDeps?: EvaluateJobsDeps;
  deliverDigest?: typeof deliverDigest;
  deliverDigestDeps?: DeliverDigestDeps;
  advanceUserSchedule?: typeof advanceUserSchedule;
}

export interface RunSchedulerPipelineResult {
  scraped: number;
  evaluated: number;
  digest: DeliverDigestResult;
  lastRunAt: string;
  nextRunAt: string;
}

/**
 * Orchestrates the full per-user scheduled pipeline:
 * B5 scrape -> dedupe -> B6 omit-already-evaluated -> B7 Bedrock evaluation
 * -> digest delivery -> B9 schedule advancement. Every sub-step is an
 * injectable dependency, mirroring `RunUserPipelineDeps`.
 *
 * `deliverDigest` never throws: a skipped or failed send is a result, so
 * the schedule always advances once evaluation finishes (FR-4). Unsent
 * matches stay without `sentAt` and go out in the next digest. Errors
 * before delivery (scrape, Bedrock, DynamoDB) still fail the run and leave
 * the schedule for the next hourly tick.
 */
export const runSchedulerPipelineForUser = async (
  user: SchedulerPipelineUser,
  deps: RunSchedulerPipelineDeps = {},
): Promise<RunSchedulerPipelineResult> => {
  const runPipeline = deps.runUserPipeline ?? runUserPipeline;
  const dedupe = deps.dedupeByJobId ?? dedupeByJobId;
  const loadExisting = deps.loadExistingMatchIds ?? loadExistingMatchIds;
  const evaluateJobs = deps.evaluateJobsForUser ?? evaluateJobsForUser;
  const deliver = deps.deliverDigest ?? deliverDigest;
  const advanceSchedule = deps.advanceUserSchedule ?? advanceUserSchedule;

  const pipelineResult = await runPipeline(user.targetRoles, deps.runUserPipelineDeps);
  const dedupedJobs = dedupe(pipelineResult.upserted);

  // B6: a jobId with an existing MatchResult is never sent to Bedrock
  // again. Whether it still needs emailing is decided by `sentAt` in
  // deliverDigest, not here.
  const existingJobIds = await loadExisting(
    user.userId,
    dedupedJobs.map((job) => job.jobId),
  );
  const remainingJobs = dedupedJobs.filter((job) => !existingJobIds.has(job.jobId));

  const newMatches = await evaluateJobs(
    user.userId,
    user.targetRoles,
    remainingJobs,
    deps.evaluateJobsDeps,
  );

  // Every job scraped this run, so older unsent matches for re-scraped
  // jobs don't need a separate jobs-table read.
  const jobsById: Record<string, JobPosting> = {};
  for (const job of dedupedJobs) {
    jobsById[job.jobId] = job;
  }

  const recipient: DigestRecipient = {
    userId: user.userId,
    email: user.email,
    schedulerEnabled: user.schedulerEnabled,
    emailSuppressed: user.emailSuppressed,
    emailVerificationStatus: user.emailVerificationStatus,
  };
  const digestResult = await deliver(recipient, newMatches, jobsById, deps.deliverDigestDeps);

  const { lastRunAt, nextRunAt }: AdvanceScheduleResult = await advanceSchedule(
    user.userId,
    user.scheduleIntervalDays,
  );

  return {
    scraped: pipelineResult.scraped,
    evaluated: newMatches.length,
    digest: digestResult,
    lastRunAt,
    nextRunAt,
  };
};
