const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Sri Lanka observes no daylight saving time, so IST is a fixed UTC+05:30.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/**
 * Returns the next calendar boundary in IST (00:00) strictly after `from`:
 * - 1 (daily)   -> next day at 00:00 IST
 * - 7 (weekly)  -> next Monday at 00:00 IST
 * - 30 (monthly) -> the 1st of next month at 00:00 IST
 *
 * Values are validated to [1, 7, 30] on write, so any other value is a bug.
 */
export const nextScheduledRunAt = (scheduleIntervalDays: number, from: Date): Date => {
  // Shift to IST wall-clock time, then read it with UTC getters so the
  // machine's own timezone never affects the result.
  const istNow = new Date(from.getTime() + IST_OFFSET_MS);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const day = istNow.getUTCDate();
  const istStartOfDay = Date.UTC(year, month, day);

  let istBoundary: number;
  switch (scheduleIntervalDays) {
    case 1:
      istBoundary = istStartOfDay + MS_PER_DAY;
      break;
    case 7: {
      const dayOfWeek = istNow.getUTCDay(); // 0 = Sunday, 1 = Monday
      const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7;
      istBoundary = istStartOfDay + daysUntilMonday * MS_PER_DAY;
      break;
    }
    case 30:
      istBoundary = Date.UTC(year, month + 1, 1);
      break;
    default:
      throw new Error(`Unsupported scheduleIntervalDays: ${scheduleIntervalDays}`);
  }

  return new Date(istBoundary - IST_OFFSET_MS);
};
