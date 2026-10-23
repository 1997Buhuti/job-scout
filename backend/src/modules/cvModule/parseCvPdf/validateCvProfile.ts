import { BadRequestError } from '@common/ErrorTypes';

import type { CvEducation, CvExperience, CvProfile } from './types';

/** Spec FR-2 caps. Enforced here regardless of what the client already did. */
export const CV_PROFILE_LIMITS = {
  SKILLS: 40,
  SKILL_LENGTH: 48,
  EXPERIENCE: 15,
  EDUCATION: 10,
  SUMMARY_LENGTH: 500,
  FULL_NAME_LENGTH: 100,
  TITLE_COMPANY_LENGTH: 200,
  PERIOD_LENGTH: 100,
  DEGREE_FIELD_LENGTH: 100,
  YEAR_LENGTH: 20,
} as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Strings only; control characters become spaces, whitespace is collapsed, empty -> undefined. */
const cleanString = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
};

const requireArray = (value: unknown, field: string): unknown[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestError(`cvProfile.${field} must be an array`);
  }
  return value;
};

const sanitizeSkills = (value: unknown): string[] => {
  const seen = new Set<string>();
  const skills: string[] = [];

  for (const item of requireArray(value, 'skills')) {
    if (typeof item !== 'string') continue;
    const skill = cleanString(item, Number.MAX_SAFE_INTEGER);
    // Over-long "skills" are sentences, not skills: drop rather than truncate.
    if (!skill || skill.length > CV_PROFILE_LIMITS.SKILL_LENGTH) continue;

    const dedupeKey = skill.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    skills.push(skill);
    if (skills.length >= CV_PROFILE_LIMITS.SKILLS) break;
  }
  return skills;
};

const sanitizeExperience = (value: unknown): CvExperience[] => {
  const entries: CvExperience[] = [];

  for (const item of requireArray(value, 'experience')) {
    if (!isPlainObject(item)) continue;
    const title = cleanString(item.title, CV_PROFILE_LIMITS.TITLE_COMPANY_LENGTH);
    const company = cleanString(item.company, CV_PROFILE_LIMITS.TITLE_COMPANY_LENGTH);
    if (!title || !company) continue;

    const entry: CvExperience = { title, company };
    const period = cleanString(item.period, CV_PROFILE_LIMITS.PERIOD_LENGTH);
    const summary = cleanString(item.summary, CV_PROFILE_LIMITS.SUMMARY_LENGTH);
    if (period) entry.period = period;
    if (summary) entry.summary = summary;

    entries.push(entry);
    if (entries.length >= CV_PROFILE_LIMITS.EXPERIENCE) break;
  }
  return entries;
};

const sanitizeEducation = (value: unknown): CvEducation[] => {
  const entries: CvEducation[] = [];

  for (const item of requireArray(value, 'education')) {
    if (!isPlainObject(item)) continue;
    const institution = cleanString(item.institution, CV_PROFILE_LIMITS.TITLE_COMPANY_LENGTH);
    if (!institution) continue;

    const entry: CvEducation = { institution };
    const degree = cleanString(item.degree, CV_PROFILE_LIMITS.DEGREE_FIELD_LENGTH);
    const field = cleanString(item.field, CV_PROFILE_LIMITS.DEGREE_FIELD_LENGTH);
    const year = cleanString(item.year, CV_PROFILE_LIMITS.YEAR_LENGTH);
    if (degree) entry.degree = degree;
    if (field) entry.field = field;
    if (year) entry.year = year;

    entries.push(entry);
    if (entries.length >= CV_PROFILE_LIMITS.EDUCATION) break;
  }
  return entries;
};

/**
 * Turns the untrusted `cvProfile` from the request body into a `CvProfile`
 * that is safe to store.
 *
 * - Throws `BadRequestError` if it is not an object or a list field is not an array.
 * - Builds a new object from known fields only (unknown fields are dropped).
 * - Trims/cleans strings, drops invalid or empty entries, dedupes skills and
 *   enforces every cap from the spec.
 * - `extractedAt` and `sourceCvS3Key` are always set by the server; any
 *   client-supplied values are ignored.
 */
export const sanitizeCvProfile = (input: unknown, sourceCvS3Key: string, now: Date = new Date()): CvProfile => {
  if (!isPlainObject(input)) {
    throw new BadRequestError('cvProfile must be an object');
  }

  const profile: CvProfile = {
    skills: sanitizeSkills(input.skills),
    experience: sanitizeExperience(input.experience),
    education: sanitizeEducation(input.education),
    extractedAt: now.toISOString(),
    sourceCvS3Key,
  };

  const fullName = cleanString(input.fullName, CV_PROFILE_LIMITS.FULL_NAME_LENGTH);
  const summary = cleanString(input.summary, CV_PROFILE_LIMITS.SUMMARY_LENGTH);
  if (fullName) profile.fullName = fullName;
  if (summary) profile.summary = summary;

  return profile;
};
