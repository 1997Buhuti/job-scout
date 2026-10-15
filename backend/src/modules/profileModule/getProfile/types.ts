export interface UserProfile {
  userId: string;
  email: string;
  targetRoles: string[];
  cvS3Key?: string;
  scheduleIntervalDays: number;
  schedulerEnabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}
