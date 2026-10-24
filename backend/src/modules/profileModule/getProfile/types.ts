import type { CvProfile } from '@modules/cvModule/parseCvPdf/types';

export interface UserProfile {
  userId: string;
  email: string;
  targetRoles: string[];
  cvS3Key?: string;
  cvProfile?: CvProfile;
  scheduleIntervalDays: number;
  schedulerEnabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}
