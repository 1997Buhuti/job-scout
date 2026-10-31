import type { UserProfileData } from '@/features/profile/types/userProfile';

import { getIdToken } from './profileService';
import { getApiBaseUrl } from './config';

/**
 * Single source of truth for the scheduler frequency presets.
 * scheduleIntervalDays is restricted to exactly these three values
 * everywhere in the UI — no custom/arbitrary day input.
 */
export const FREQUENCY_PRESETS = [
  { label: 'Daily', days: 1 },
  { label: 'Weekly', days: 7 },
  { label: 'Monthly', days: 30 },
] as const;

export interface UpdateSchedulePayload {
  scheduleIntervalDays?: 1 | 7 | 30;
  schedulerEnabled?: boolean;
}

/**
 * Update the caller's scheduler settings via PUT /me/schedule.
 */
export async function updateSchedule(
  payload: UpdateSchedulePayload,
): Promise<UserProfileData> {
  try {
    const token = await getIdToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${getApiBaseUrl()}/me/schedule`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const message = body?.error?.message ?? `Failed to update schedule (${res.status})`;
      throw new Error(message);
    }

    const data = await res.json();
    return data as UserProfileData;
  } catch (err) {
    console.error('[Schedule API] Error updating schedule:', err);
    throw err;
  }
}
