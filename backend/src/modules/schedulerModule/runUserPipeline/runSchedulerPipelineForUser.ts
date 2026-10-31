import type { AdvanceScheduleResult } from './advanceSchedule';
import { advanceUserSchedule } from './advanceSchedule';
import type { EvaluateJobsDeps } from './evaluateJobs';
import { evaluateJobsForUser } from './evaluateJobs';
import { dedupeByJobId, loadExistingMatchIds } from './loadExistingMatches';
import type { RunUserPipelineDeps } from './runUserPipeline';
import { runUserPipeline } from './runUserPipeline';
import type { SendDigestDeps, SendDigestResult } from './sendDigest';
import { sendDigestForUser } from './sendDigest';
import type { JobPosting } from './types';

export interface SchedulerPipelineUser {
  userId: string;
  email: string;
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
  sendDigestForUser?: typeof sendDigestForUser;
  sendDigestDeps?: SendDigestDeps;
  advanceUserSchedule?: typeof advanceUserSchedule;
}

export interface RunSchedulerPipelineResult {
  scraped: number;
  evaluated: number;
  digest: SendDigestResult;
  lastRunAt: string;
  nextRunAt: string;
}

/**
 * Orchestrates the full per-user scheduled pipeline:
 * B5 scrape -> dedupe -> B6 omit-already-suggested -> B7 Bedrock evaluation
 * -> B8 SES digest -> B9 schedule advancement. B9 always runs on
 * successful completion, even when there are zero new matches. Every
 * sub-step is an injectable dependency, mirroring `RunUserPipelineDeps`.
 */
export const runSchedulerPipelineForUser = async (
  user: SchedulerPipelineUser,
  deps: RunSchedulerPipelineDeps = {},
): Promise<RunSchedulerPipelineResult> => {
  const runPipeline = deps.runUserPipeline ?? runUserPipeline;
  const dedupe = deps.dedupeByJobId ?? dedupeByJobId;
  const loadExisting = deps.loadExistingMatchIds ?? loadExistingMatchIds;
  const evaluateJobs = deps.evaluateJobsForUser ?? evaluateJobsForUser;
  const sendDigest = deps.sendDigestForUser ?? sendDigestForUser;
  const advanceSchedule = deps.advanceUserSchedule ?? advanceUserSchedule;

  const pipelineResult = await runPipeline(user.targetRoles, deps.runUserPipelineDeps);
  const dedupedJobs = dedupe(pipelineResult.upserted);

  // B6: omit-already-suggested — drop jobIds with an existing MatchResult
  // before they're ever sent to Bedrock.
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

  const jobsById: Record<string, JobPosting> = {};
  for (const job of remainingJobs) {
    jobsById[job.jobId] = job;
  }

  const digestResult = await sendDigest(user.email, newMatches, jobsById, deps.sendDigestDeps);

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
