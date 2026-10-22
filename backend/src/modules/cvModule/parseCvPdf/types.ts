/** Request body for `POST /cv/parse`. */
export interface ParseCvRequest {
  key: string;
}

/** Response returned after parsing the uploaded CV PDF. */
export interface ParseCvResult {
  key: string;
  text: string;
  charCount: number;
  cvProfile?: CvProfile;
}

/**
 * Experience entry from CV
 */
export interface CvExperience {
  /** Job title */
  title: string;
  /** Company name */
  company: string;
  /** Free-form period if dates are unclear, e.g. "2021 – Present" */
  period?: string;
  /** Short summary of responsibilities/achievements */
  summary?: string;
}

/**
 * Education entry from CV
 */
export interface CvEducation {
  /** Institution name */
  institution: string;
  /** Degree earned (e.g., B.Sc., M.Sc., PhD) */
  degree?: string;
  /** Field of study */
  field?: string;
  /** Graduation year or period string */
  year?: string;
}

/**
 * Structured CV profile extracted from PDF text
 */
export interface CvProfile {
  /** Best-effort full name from the CV */
  fullName?: string;
  /** Short professional summary if present */
  summary?: string;
  /** Normalized skill labels (deduped, trimmed, case-normalized) */
  skills: string[];
  experience: CvExperience[];
  education: CvEducation[];
  /** ISO-8601 when this extract was produced */
  extractedAt: string;
  /** S3 key of the PDF this extract was derived from */
  sourceCvS3Key: string;
}
