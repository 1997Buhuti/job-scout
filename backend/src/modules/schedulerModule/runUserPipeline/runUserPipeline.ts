import { scrapeTopJobs } from './scrapeJobs';
import type { JobPosting, RunUserPipelineResult, ScrapedJob, ScraperSource } from './types';
import { upsertJobPosting } from './upsertJobPosting';

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
  const sources = deps.sources ?? [scrapeTopJobs()];
  const upsert = deps.upsert ?? upsertJobPosting;

  const scrapedBySources = await Promise.all(sources.map((source) => source(targetRoles)));

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
