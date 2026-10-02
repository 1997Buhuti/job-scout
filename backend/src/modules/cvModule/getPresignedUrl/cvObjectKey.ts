import { CV_FILE_EXTENSION, CV_KEY_PREFIX } from './constants';

/**
 * CV object key scoped to the owning user, e.g. `cvs/<sub>/1750000000000.pdf`.
 * The per-user segment keeps callers from reading each other's CVs.
 */
export const buildCvObjectKey = (userId: string, timestampMs: number): string => `${CV_KEY_PREFIX}/${userId}/${timestampMs}${CV_FILE_EXTENSION}`;