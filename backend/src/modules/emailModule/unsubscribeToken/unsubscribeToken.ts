import * as crypto from 'crypto';

import type { UnsubscribePayload } from './types';

const HMAC_ALGO = 'sha256';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * U2: signs an HMAC token containing the user ID and a 30-day expiry.
 * Returns a base64url-encoded string of `payloadBase64.hmacBase64`.
 */
export const signUnsubscribeToken = (userId: string, signingSecret: string): string => {
  const payload: UnsubscribePayload = {
    userId,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const hmac = crypto.createHmac(HMAC_ALGO, signingSecret).update(payloadBase64).digest('base64url');
  return `${payloadBase64}.${hmac}`;
};

/**
 * U2: verifies an HMAC token and returns the payload if valid and not expired.
 * Returns `null` for invalid, tampered, or expired tokens.
 */
export const verifyUnsubscribeToken = (
  token: string,
  signingSecret: string,
): UnsubscribePayload | null => {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [payloadBase64, providedHmac] = parts;

  let payload: UnsubscribePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  // Expired?
  if (payload.exp < Date.now()) {
    return null;
  }

  // Tampered?
  const expectedHmac = crypto.createHmac(HMAC_ALGO, signingSecret).update(payloadBase64).digest('base64url');
  if (providedHmac !== expectedHmac) {
    return null;
  }

  return payload;
};
