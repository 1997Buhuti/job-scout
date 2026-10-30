import type { CvProfile } from '@modules/cvModule/parseCvPdf/types';

export type WorkMode = 'remote' | 'hybrid' | 'onsite';

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
  createdAt: string;
  updatedAt: string;
}
