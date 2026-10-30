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
