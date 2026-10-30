import type { FilterableJob, JobFilterPreferences } from './types';

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True if any excluded keyword matches the job's title or description.
 * Matching is case-insensitive and whole-word (e.g. "java" does not match
 * "javascript").
 */
export const matchesExcludedKeyword = (
  job: FilterableJob,
  keywords: string[],
): boolean => {
  if (keywords.length === 0) {
    return false;
  }

  const haystack = `${job.title}\n${job.description}`;

  return keywords.some((keyword) => {
    const trimmed = keyword.trim();
    if (trimmed === '') {
      return false;
    }
    const pattern = new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, 'i');
    return pattern.test(haystack);
  });
};

/**
 * True only when the job's work mode is known (remote, hybrid, or onsite)
 * and is not one of the user's selected work modes. A job with an
 * unknown/missing work mode is always kept.
 */
export const matchesWorkMode = (
  job: FilterableJob,
  workModes: Array<'remote' | 'hybrid' | 'onsite'>,
): boolean => {
  const knownWorkMode = job.workMode;
  if (
    knownWorkMode !== 'remote' &&
    knownWorkMode !== 'hybrid' &&
    knownWorkMode !== 'onsite'
  ) {
    return false;
  }

  return !workModes.includes(knownWorkMode);
};

/**
 * Applies the excluded-keyword and work-mode filters to a list of scraped
 * jobs. Does not read `minMonthlySalaryLkr` — salary filtering is out of
 * scope (see FR-7 in specs/features/05-preferences/01-spec.md).
 */
export const filterJobsForUser = <T extends FilterableJob>(
  jobs: T[],
  prefs: JobFilterPreferences,
): T[] =>
  jobs.filter(
    (job) =>
      !matchesExcludedKeyword(job, prefs.excludedKeywords) &&
      !matchesWorkMode(job, prefs.workModes),
  );
