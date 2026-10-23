/**
 * Request body for `POST /cv/parse`.
 *
 * The browser reads the uploaded PDF and structures it; the API only
 * validates and persists the result. `cvProfile` is untrusted client input
 * and is typed `unknown` until it passes `sanitizeCvProfile`. When it is
 * omitted (the browser could not read the PDF) only the S3 pointer is saved.
 */
export interface ParseCvRequest {
  key: string;
  cvProfile?: unknown;
}

/** Internal result of saving the CV. The HTTP response is `204 No Content`. */
export interface ParseCvResult {
  key: string;
}

/** Experience entry from the CV. */
export interface CvExperience {
  /** Job title. */
  title: string;
  /** Company name. */
  company: string;
  /** Free-form period, e.g. "2021 - Present". */
  period?: string;
  /** Short summary of responsibilities/achievements. */
  summary?: string;
}

/** Education entry from the CV. */
export interface CvEducation {
  /** Institution name. */
  institution: string;
  /** Degree earned (e.g. B.Sc., M.Sc., PhD). */
  degree?: string;
  /** Field of study. */
  field?: string;
  /** Graduation year or period string. */
  year?: string;
}

/** Structured CV profile, as stored on `UserProfile.cvProfile`. */
export interface CvProfile {
  /** Best-effort full name from the CV. */
  fullName?: string;
  /** Short professional summary if present. */
  summary?: string;
  /** Normalized skill labels (deduped, trimmed). */
  skills: string[];
  experience: CvExperience[];
  education: CvEducation[];
  /** ISO-8601 time the profile was stored (set by the server). */
  extractedAt: string;
  /** S3 key of the PDF the profile was derived from (set by the server). */
  sourceCvS3Key: string;
}
