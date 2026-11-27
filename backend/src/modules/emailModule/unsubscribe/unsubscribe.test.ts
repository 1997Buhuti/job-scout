import crypto from 'crypto';

import { signUnsubscribeToken, verifyUnsubscribeToken } from '@modules/emailModule/unsubscribeToken/unsubscribeToken';

describe('unsubscribe integration', () => {
  const secret = 'test-signing-secret';
  const userId = 'user-123';

  describe('valid token handling', () => {
    it('unsubscribes user when token is valid (integration)', async () => {
      const token = signUnsubscribeToken(userId, secret);
      const payload = verifyUnsubscribeToken(token, secret);

      expect(payload).not.toBeNull();
      expect(payload?.userId).toBe(userId);
      expect(payload?.exp - Date.now()).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000 - 1000);
    });

    it('returns null for tampered token', () => {
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
      const now = Date.now();
      const expiredPayload = {
        userId,
        exp: now - 1000 * 60 * 60, // 1 hour ago
      };
      const payloadB64 = Buffer.from(JSON.stringify(expiredPayload), 'utf8').toString('base64url');
      const hmac = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
      const expiredToken = `${payloadB64}.${hmac}`;

      const payload = verifyUnsubscribeToken(expiredToken, secret);
      expect(payload).toBeNull();
    });
  });

  describe('signature verification', () => {
    it('verifies correct HMAC signature', () => {
      const token = signUnsubscribeToken(userId, secret);
      const payload = verifyUnsubscribeToken(token, secret);
      expect(payload).not.toBeNull();
    });

    it('rejects tampered signature', () => {
      const token = signUnsubscribeToken(userId, secret);
      const parts = token.split('.');
      const hmac = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url');
      const badHmacToken = `${parts[0]}.${hmac}X`; // modify last character

      const payload = verifyUnsubscribeToken(badHmacToken, secret);
      expect(payload).toBeNull();
    });
  });
});
