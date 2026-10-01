import { BadRequestError } from '@common/ErrorTypes';

const MAX_ROLES = 10;
const MAX_ROLE_LENGTH = 80;

/**
 * Validate and normalize `targetRoles` per FR-4.
 * Rejects empty strings after trim; max 10 roles; each ≤ 80 chars.
 */
export const validateTargetRoles = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) {
    throw new BadRequestError('targetRoles must be an array of strings');
  }

  if (raw.length > MAX_ROLES) {
    throw new BadRequestError(`targetRoles must contain at most ${MAX_ROLES} items`);
  }

  const roles: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== 'string') {
      throw new BadRequestError('targetRoles must be an array of strings');
    }

    const trimmed = entry.trim();

    if (!trimmed) {
      throw new BadRequestError('targetRoles entries must not be empty');
    }

    if (trimmed.length > MAX_ROLE_LENGTH) {
      throw new BadRequestError(`Each target role must be at most ${MAX_ROLE_LENGTH} characters`);
    }

    roles.push(trimmed);
  }

  return roles;
};
