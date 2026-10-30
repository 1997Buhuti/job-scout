/**
 * Domain shape of a user's profile, mirroring the backend `UserProfile`
 * type (backend/src/modules/profileModule/getProfile/types.ts).
 *
 * Covers both the GET /me/profile response and the PUT /me/profile payload.
 */

/** Work arrangement a user is willing to consider (spec 05-preferences). */
export type WorkMode = 'remote' | 'hybrid' | 'onsite';

export interface UserProfileData {
  userId: string;
  email: string;
  targetRoles: string[];
  /** Keywords that disqualify a job match when present (spec 05-preferences). */
  excludedKeywords: string[];
  /** Work arrangements the user is willing to consider (spec 05-preferences). */
  workModes: WorkMode[];
  /** Minimum acceptable monthly salary in LKR, or null when unset (spec 05-preferences). */
  minMonthlySalaryLkr: number | null;
  cvS3Key?: string;
  cvProfile?: {
    skills: string[];
    experience: Array<{
      title: string;
      company: string;
      period?: string;
      summary?: string;
    }>;
    education: Array<{
      institution: string;
      degree?: string;
      field?: string;
      year?: string;
    }>;
    fullName?: string;
    summary?: string;
    extractedAt: string;
    sourceCvS3Key: string;
  };
  scheduleIntervalDays: number;
  schedulerEnabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}
