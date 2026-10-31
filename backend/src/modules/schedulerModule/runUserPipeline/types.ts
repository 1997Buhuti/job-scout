import type { WorkMode } from '@modules/profileModule/getProfile/types';

/**
 * Minimal shape of a scraped job needed by the preference filters.
 * Mirrors the relevant fields of the `JobPosting` schema in
 * specs/02-database-schema.md. `description` corresponds to
 * `JobPosting.rawDescription`; `workMode` is not yet part of the
 * persisted schema and is treated as optional/unknown here.
 */
export interface FilterableJob {
  title: string;
  description: string;
  workMode?: WorkMode | null;
}

export interface JobFilterPreferences {
  excludedKeywords: string[];
  workModes: WorkMode[];
}

/**
 * Shared types for the B5 scrape + upsert step of `runUserPipeline`.
 * Mirrors `specs/02-database-schema.md` §2 (`JobPosting`) verbatim.
 */

export type SourceSite =
  | 'topjobs.lk'
  | 'rooster.jobs'
  | 'careers.lk'
  | 'itpro.lk'
  | 'jobseeker.lk';

export interface JobPosting {
  /** MD5 hex digest of the canonical job URL */
  jobId: string;
  sourceSite: SourceSite;
  title: string;
  company: string;
  url: string;
  rawDescription: string;
  scrapedAt: string; // ISO-8601
}

/**
 * What a scraper source produces before it has been upserted.
 * `jobId` is derived from `url` (not scraped); `scrapedAt` is stamped by
 * `upsertJobPosting` at write time, so neither is present here.
 */
export type ScrapedJob = Omit<JobPosting, 'jobId' | 'scrapedAt'>;

/** A pluggable scraper for one job portal. */
export type ScraperSource = (targetRoles: string[]) => Promise<ScrapedJob[]>;

export interface RunUserPipelineResult {
  /** Count of unique (by URL) jobs scraped across all sources. */
  scraped: number;
  upserted: JobPosting[];
}

/**
 * Verbatim from `specs/02-database-schema.md` §3. `partitionKey` is also
 * the DynamoDB `PK` value (`${userId}#${jobId}`).
 */
export interface MatchResult {
  partitionKey: string;
  userId: string;
  jobId: string;
  matchScore: number; // 0-100
  reasoning: string;
  matchingSkills: string[];
  /** ISO-8601 when included in an SES digest; undefined if not yet sent */
  sentAt?: string;
  evaluatedAt: string; // ISO-8601
}
