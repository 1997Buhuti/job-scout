/**
 * Structured CV profile (spec 04-cv-structured-extract, FR-2).
 *
 * Produced in the browser from the text of the uploaded PDF and sent to
 * `POST /cv/parse`, where the API re-validates and persists it.
 */

export interface CvExperience {
  /** Job title. */
  title: string;
  /** Company name. */
  company: string;
  /** Free-form period, e.g. "2021 - Present". */
  period?: string;
  /** Short summary of responsibilities / achievements. */
  summary?: string;
}

export interface CvEducation {
  institution: string;
  /** Degree earned, e.g. "Bachelor of Science". */
  degree?: string;
  /** Field of study, e.g. "Computer Science". */
  field?: string;
  /** Graduation year or period string. */
  year?: string;
}

export interface CvProfile {
  /** Best-effort full name from the CV. */
  fullName?: string;
  /** Short professional summary if present. */
  summary?: string;
  /** Normalized skill labels (deduped, trimmed, case-normalized). */
  skills: string[];
  experience: CvExperience[];
  education: CvEducation[];
  /** ISO-8601 timestamp of when this extract was produced. */
  extractedAt: string;
  /** S3 key of the PDF this extract was derived from. */
  sourceCvS3Key: string;
}
