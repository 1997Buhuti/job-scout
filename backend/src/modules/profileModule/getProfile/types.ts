import type { CvProfile } from '@modules/cvModule/parseCvPdf/types';

export type WorkMode = 'remote' | 'hybrid' | 'onsite';

/** SES recipient verification state. Only used while `SES_SANDBOX_MODE` is on. */
export type EmailVerificationStatus = 'NOT_REQUESTED' | 'PENDING' | 'VERIFIED';

export type EmailSuppressedReason = 'BOUNCE' | 'COMPLAINT';

/**
 * Stored user profile. The email delivery fields are system-owned: they are
 * read-only through the profile API, and missing values read as
 * `NOT_REQUESTED` / not suppressed.
 */
export interface UserProfile {
  userId: string;
  email: string;
  targetRoles: string[];
  excludedKeywords: string[];
  workModes: WorkMode[];
  minMonthlySalaryLkr: number | null;
  cvS3Key?: string;
  cvProfile?: CvProfile;
  scheduleIntervalDays: number;
  schedulerEnabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  emailVerificationStatus?: EmailVerificationStatus;
  emailSuppressed?: boolean;
  emailSuppressedReason?: EmailSuppressedReason;
  emailSuppressedAt?: string;
  createdAt: string;
  updatedAt: string;
}
