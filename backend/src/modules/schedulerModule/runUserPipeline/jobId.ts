import { createHash } from 'node:crypto';

/**
 * Derives a stable `JobPosting.jobId` from a canonical job URL.
 * Same URL -> same jobId, so re-scraping a listing upserts instead of
 * creating a duplicate item. Verbatim from `specs/02-database-schema.md` §2.
 */
export const jobIdFromUrl = (canonicalUrl: string): string =>
  createHash('md5').update(canonicalUrl).digest('hex');
