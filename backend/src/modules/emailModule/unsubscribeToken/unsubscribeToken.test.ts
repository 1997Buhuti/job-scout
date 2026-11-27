import crypto from 'crypto';

import { signUnsubscribeToken, verifyUnsubscribeToken } from '@modules/emailModule/unsubscribeToken/unsubscribeToken';

describe('unsubscribeToken', () => {
  const secret = 'test-signing-secret';
  const userId = 'user-123';

  describe('signUnsubscribeToken', () => {
    it('produces a base64url-encoded token with HMAC signature', () => {
      const token = signUnsubscribeToken(userId, secret);

      // Token has two parts separated by a dot
      const parts = token.split('.');
      expect(parts).toHaveLength(2);

      const [payloadB64, hmacB64] = parts;

      // Payload decodes to JSON with userId and exp
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      expect(payload).toEqual({
        userId,
        exp: expect.any(Number),
      });
      expect(payload.exp - Date.now()).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1000);
      expect(payload.exp - Date.now()).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000);

      // HMAC is non-empty
      expect(hmacB64).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('verifyUnsubscribeToken', () => {
    it('returns payload for a valid, unexpired token', () => {
      const token = signUnsubscribeToken(userId, secret);
      const payload = verifyUnsubscribeToken(token, secret);

      expect(payload).toEqual({
        userId,
        exp: expect.any(Number),
      });
    });

    it('returns null for a tampered token', () => {
      const token = signUnsubscribeToken(userId, secret);
      const parts = token.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ userId: 'hacker', exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }), 'utf8').toString('base64url');
      const tamperedToken = `${tamperedPayload}.${parts[1]}`;

      const payload = verifyUnsubscribeToken(tamperedToken, secret);
      expect(payload).toBeNull();
    });

    it('returns null for wrong secret', () => {
      const token = signUnsubscribeToken(userId, secret);
      const payload = verifyUnsubscribeToken(token, 'wrong-secret');

      expect(payload).toBeNull();
    });

    it('returns null for expired token', () => {
      const expiredPayload = {
        userId,
        exp: Date.now() - 1000 * 60 * 60, // expired 1 hour ago
      };
      const payloadB64 = Buffer.from(JSON.stringify(expiredPayload), 'utf8').toString('base64url');
      const hmac = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
      const expiredToken = `${payloadB64}.${hmac}`;

      const payload = verifyUnsubscribeToken(expiredToken, secret);
      expect(payload).toBeNull();
    });

    it('returns null for malformed token', () => {
      expect(verifyUnsubscribeToken('not.a.valid.token', secret)).toBeNull();
      expect(verifyUnsubscribeToken('only-one-part', secret)).toBeNull();
      expect(verifyUnsubscribeToken('a.b.c.d', secret)).toBeNull();
      expect(verifyUnsubscribeToken('notbase64!@#$%^&*()', secret)).toBeNull();
    });

    it('returns null for JSON parse error', () => {
      const badPayload = Buffer.from('not json at all').toString('base64url');
      const hmac = crypto.createHmac('sha256', secret).update(badPayload).digest('base64url');
      const badToken = `${badPayload}.${hmac}`;

      const payload = verifyUnsubscribeToken(badToken, secret);
      expect(payload).toBeNull();
    });
  });
});
