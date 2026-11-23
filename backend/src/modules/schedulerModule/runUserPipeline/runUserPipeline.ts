import { SCHEDULER_SERVICE } from '@common/constants';
import { Logger } from '@common/logger';

import { createDefaultScraperSources } from './scrapers';
import type { JobPosting, RunUserPipelineResult, ScrapedJob, ScraperSource } from './types';
import { upsertJobPosting } from './upsertJobPosting';

const logger = new Logger(SCHEDULER_SERVICE);

export interface RunUserPipelineDeps {
  sources?: ScraperSource[];
  upsert?: (job: ScrapedJob) => Promise<JobPosting>;
}

/**
 * B5: scrape step of the per-user scheduler pipeline. Runs every configured
 * scraper source for the given `targetRoles`, dedupes by URL across sources,
 * and upserts each unique job. Omit-already-suggested (B6), Bedrock
 * evaluation (B7), SES digest (B8) and `lastRunAt`/`nextRunAt` advancement
 * (B9) are deliberately out of scope here — a future dispatcher (B3/B4)
 * calls this per due user and chains the remaining steps.
 */
export const runUserPipeline = async (
  targetRoles: string[],
  deps: RunUserPipelineDeps = {},
): Promise<RunUserPipelineResult> => {
  const sources = deps.sources ?? createDefaultScraperSources();
  const upsert = deps.upsert ?? upsertJobPosting;

  const settledSources = await Promise.allSettled(
    sources.map((source) => source(targetRoles)),
  );
  const successfulSources = settledSources.filter(
    (result): result is PromiseFulfilledResult<ScrapedJob[]> => result.status === 'fulfilled',
  );

  settledSources.forEach((result, index) => {
    const sourceSite = sources[index].sourceSite ?? `source-${index + 1}`;
    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      logger.warn({
        message: 'Job portal scrape failed; continuing with other portals',
        data: { sourceSite, error: reason },
      });
      return;
    }
    logger.info({
      message: 'Job portal scrape complete',
      data: { sourceSite, scraped: result.value.length },
    });
  });

  if (sources.length > 0 && successfulSources.length === 0) {
    throw new Error('All configured job portal scrapers failed');
  }

  const scrapedBySources = successfulSources.map((result) => result.value);

  const seenUrls = new Set<string>();
  const uniqueJobs: ScrapedJob[] = [];
  for (const job of scrapedBySources.flat()) {
    if (seenUrls.has(job.url)) continue;
    seenUrls.add(job.url);
    uniqueJobs.push(job);
  }

  const upserted: JobPosting[] = [];
  for (const job of uniqueJobs) {
    upserted.push(await upsert(job));
  }

  return { scraped: uniqueJobs.length, upserted };
};
