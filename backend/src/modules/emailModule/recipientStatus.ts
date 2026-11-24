import {
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  SESv2Client,
} from '@aws-sdk/client-sesv2';

import type { EmailVerificationStatus } from '@modules/profileModule/getProfile/types';

const SANDBOX_MODE_ENV_KEY = 'SES_SANDBOX_MODE';

// Two attempts keeps a slow SES call from stalling the profile read. Callers
// treat a failure as "not requested yet" and retry on the next read.
const sesClient = new SESv2Client({ region: 'us-east-1', maxAttempts: 2 });

/**
 * True unless `SES_SANDBOX_MODE` is explicitly `false`. Defaulting to sandbox
 * matches the account state until production access is granted.
 */
export const isSandboxMode = (): boolean =>
  (process.env[SANDBOX_MODE_ENV_KEY] ?? 'true').trim().toLowerCase() !== 'false';

/**
 * Asks SES to verify `email` as a recipient identity, which sends the user an
 * AWS verification email. An address that already exists in SES is not
 * requested again; its current status is returned instead.
 *
 * Returns `null` without calling SES when sandbox mode is off.
 */
export const requestRecipientVerification = async (
  email: string,
): Promise<EmailVerificationStatus | null> => {
  if (!isSandboxMode()) {
    return null;
  }

  try {
    await sesClient.send(new CreateEmailIdentityCommand({ EmailIdentity: email }));
    return 'PENDING';
  } catch (err) {
    if (hasErrorName(err, 'AlreadyExistsException')) {
      return readRecipientStatus(email);
    }
    throw err;
  }
};

/**
 * Reads the recipient's verification status from SES, the source of truth.
 *
 * Returns `null` without calling SES when sandbox mode is off.
 */
export const getRecipientStatus = async (
  email: string,
): Promise<EmailVerificationStatus | null> => {
  if (!isSandboxMode()) {
    return null;
  }
  return readRecipientStatus(email);
};

/**
 * Maps SES identity state to the profile status. Any existing identity that
 * has not reached `SUCCESS` (including `FAILED` after the link expires) is
 * `PENDING`: SES has it, but it cannot receive mail yet.
 */
const readRecipientStatus = async (
  email: string,
): Promise<EmailVerificationStatus> => {
  try {
    const identity = await sesClient.send(
      new GetEmailIdentityCommand({ EmailIdentity: email }),
    );
    return identity.VerificationStatus === 'SUCCESS' ? 'VERIFIED' : 'PENDING';
  } catch (err) {
    if (hasErrorName(err, 'NotFoundException')) {
      return 'NOT_REQUESTED';
    }
    throw err;
  }
};

const hasErrorName = (err: unknown, name: string): boolean =>
  typeof err === 'object' &&
  err !== null &&
  (err as { name?: unknown }).name === name;
