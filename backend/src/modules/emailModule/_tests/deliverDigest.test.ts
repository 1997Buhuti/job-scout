import type { Logger } from '@common/logger';
import type { DigestJob } from '@modules/emailModule/buildDigest';
import type { DeliverDigestDeps, DigestRecipient } from '@modules/emailModule/deliverDigest';
import { deliverDigest } from '@modules/emailModule/deliverDigest';
import type { DigestEmail } from '@modules/emailModule/sesSend';
import type { MatchResult } from '@modules/schedulerModule/runUserPipeline/types';

// deliverDigest's defaults touch AWS; every test injects fakes instead.
jest.mock('@modules/emailModule/digestStore', () => ({
  MATCH_SCORE_THRESHOLD: 60,
  loadUnsentMatches: jest.fn(),
  loadDigestJobs: jest.fn(),
  markMatchSent: jest.fn(),
  saveRecipientStatus: jest.fn(),
}));
jest.mock('@modules/emailModule/recipientStatus', () => ({
  getRecipientStatus: jest.fn(),
}));
jest.mock('@modules/emailModule/senderCheck', () => ({
  checkSenderDomain: jest.fn(),
}));

const FROM = 'digest@jobscout.example';

const buildMatch = (jobId: string, overrides: Partial<MatchResult> = {}): MatchResult => ({
  partitionKey: `user-1#${jobId}`,
  userId: 'user-1',
  jobId,
  matchScore: 80,
  reasoning: `Fits because of ${jobId}`,
  matchingSkills: ['TypeScript'],
  evaluatedAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

const jobFor = (jobId: string): DigestJob => ({
  title: `Title ${jobId}`,
  company: 'Acme',
  url: `https://jobs.example/${jobId}`,
});

const recipient = (overrides: Partial<DigestRecipient> = {}): DigestRecipient => ({
  userId: 'user-1',
  email: 'user@example.com',
  schedulerEnabled: true,
  emailSuppressed: false,
  emailVerificationStatus: 'VERIFIED',
  ...overrides,
});

const sesError = (name: string, httpStatusCode = 400): Error =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });

const buildLogger = () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return logger as typeof logger & Logger;
};

/**
 * Fakes with a small in-memory matches store, so a sequence of runs can
 * check what each digest contains.
 */
const buildDeps = (stored: MatchResult[] = []) => {
  const store = new Map(stored.map((match) => [match.jobId, { ...match }]));
  const sent: DigestEmail[] = [];
  const logger = buildLogger();

  const deps = {
    loadUnsentMatches: jest.fn(async () =>
      [...store.values()].filter((match) => !match.sentAt && match.matchScore >= 60),
    ),
    loadDigestJobs: jest.fn(async (jobIds: string[]) =>
      Object.fromEntries(jobIds.map((jobId) => [jobId, jobFor(jobId)])),
    ),
    checkSender: jest.fn(async () => ({ ok: true, domain: 'jobscout.example' })),
    getRecipientStatus: jest.fn(async () => 'VERIFIED' as const),
    saveRecipientStatus: jest.fn(async () => undefined),
    sendEmail: jest.fn(async (email: DigestEmail) => {
      sent.push(email);
      return { messageId: `msg-${sent.length}` };
    }),
    markMatchSent: jest.fn(async (match: MatchResult, sentAt: string) => {
      store.set(match.jobId, { ...(store.get(match.jobId) ?? match), sentAt });
    }),
    sleep: jest.fn(async () => undefined),
    fromAddress: FROM,
    logger,
    now: () => new Date('2025-02-01T00:00:00.000Z'),
  } satisfies DeliverDigestDeps;

  /** Simulates evaluateJobs saving this run's matches before delivery. */
  const save = (matches: MatchResult[]) => {
    for (const match of matches) store.set(match.jobId, { ...match });
  };

  return { deps, store, sent, logger, save };
};

describe('deliverDigest', () => {
  it('sends one digest with HTML and text parts and stamps sentAt afterwards', async () => {
    const { deps, store, sent } = buildDeps();
    const match = buildMatch('job-a');
    store.set('job-a', match);

    const result = await deliverDigest(recipient(), [match], { 'job-a': jobFor('job-a') }, deps);

    expect(result).toEqual({ status: 'sent', matchIds: ['job-a'], messageId: 'msg-1' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'user@example.com', from: FROM });
    expect(sent[0].html).toContain('Title job-a');
    expect(sent[0].text).toContain('Title job-a');
    expect(deps.markMatchSent).toHaveBeenCalledWith(match, '2025-02-01T00:00:00.000Z');
    expect(deps.sendEmail.mock.invocationCallOrder[0]).toBeLessThan(
      deps.markMatchSent.mock.invocationCallOrder[0],
    );
    expect(store.get('job-a')?.sentAt).toBe('2025-02-01T00:00:00.000Z');
  });

  it('skips when there are no unsent qualifying matches', async () => {
    const { deps } = buildDeps();

    const result = await deliverDigest(
      recipient(),
      [buildMatch('job-low', { matchScore: 59 })],
      {},
      deps,
    );

    expect(result).toEqual({ status: 'skipped', reason: 'no-unsent-matches', matchIds: [] });
    expect(deps.checkSender).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  describe('recovery of unsent matches (AC-8, AC-9)', () => {
    it('includes an old unsent match in the next digest, once', async () => {
      const old = buildMatch('job-old', { evaluatedAt: '2024-12-01T00:00:00.000Z' });
      const { deps, sent, save } = buildDeps([old]);

      // Run 1: the old match plus a new one.
      const fresh = buildMatch('job-new');
      save([fresh]);
      const run1 = await deliverDigest(recipient(), [fresh], { 'job-new': jobFor('job-new') }, deps);

      expect(run1.status).toBe('sent');
      expect(run1.matchIds.sort()).toEqual(['job-new', 'job-old']);
      expect(sent[0].html.match(/Title job-old/g)).toHaveLength(1);
      expect(deps.loadDigestJobs).toHaveBeenCalledWith(['job-old']);

      // Run 2: nothing new, and both were stamped.
      const run2 = await deliverDigest(recipient(), [], {}, deps);

      expect(run2).toEqual({ status: 'skipped', reason: 'no-unsent-matches', matchIds: [] });
      expect(sent).toHaveLength(1);
    });

    it('never includes a match that already has sentAt', async () => {
      const stamped = buildMatch('job-sent', { sentAt: '2025-01-15T00:00:00.000Z' });
      const { deps, sent } = buildDeps([stamped]);
      const fresh = buildMatch('job-new');

      const result = await deliverDigest(
        recipient(),
        // Even if the caller passes it in, a stamped match is dropped.
        [fresh, stamped],
        { 'job-new': jobFor('job-new'), 'job-sent': jobFor('job-sent') },
        deps,
      );

      expect(result.matchIds).toEqual(['job-new']);
      expect(sent[0].html).not.toContain('Title job-sent');
      expect(deps.markMatchSent).not.toHaveBeenCalledWith(stamped, expect.anything());
    });

    it('lists a match once when it is both new and already in the store', async () => {
      const match = buildMatch('job-a');
      const { deps, sent } = buildDeps([match]);

      const result = await deliverDigest(recipient(), [match], { 'job-a': jobFor('job-a') }, deps);

      expect(result.matchIds).toEqual(['job-a']);
      expect(sent[0].html.match(/Title job-a/g)).toHaveLength(1);
    });

    it('a rejected digest goes out in full on the next successful run', async () => {
      const match = buildMatch('job-a');
      const { deps, sent, store } = buildDeps([match]);
      deps.sendEmail.mockRejectedValueOnce(sesError('MessageRejected'));

      const run1 = await deliverDigest(recipient(), [match], { 'job-a': jobFor('job-a') }, deps);
      expect(run1).toMatchObject({ status: 'failed', reason: 'permanent' });
      expect(store.get('job-a')?.sentAt).toBeUndefined();

      const run2 = await deliverDigest(recipient(), [], {}, deps);
      expect(run2).toMatchObject({ status: 'sent', matchIds: ['job-a'] });
      expect(sent).toHaveLength(1);
      expect(store.get('job-a')?.sentAt).toBeDefined();
    });
  });

  describe('skips, in check order', () => {
    it('skips a profile with no email', async () => {
      const { deps } = buildDeps();

      const result = await deliverDigest(recipient({ email: '' }), [buildMatch('job-a')], {}, deps);

      expect(result).toMatchObject({ status: 'skipped', reason: 'missing-email' });
      expect(deps.sendEmail).not.toHaveBeenCalled();
    });

    it('skips a suppressed recipient before any SES call', async () => {
      const { deps, logger } = buildDeps();

      const result = await deliverDigest(
        recipient({ emailSuppressed: true, schedulerEnabled: false }),
        [buildMatch('job-a')],
        {},
        deps,
      );

      expect(result).toEqual({ status: 'skipped', reason: 'suppressed', matchIds: ['job-a'] });
      expect(deps.checkSender).not.toHaveBeenCalled();
      expect(deps.sendEmail).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reason: 'suppressed' }) }),
      );
    });

    it('skips an unsubscribed recipient', async () => {
      const { deps } = buildDeps();

      const result = await deliverDigest(
        recipient({ schedulerEnabled: false }),
        [buildMatch('job-a')],
        {},
        deps,
      );

      expect(result).toMatchObject({ status: 'skipped', reason: 'unsubscribed' });
      expect(deps.checkSender).not.toHaveBeenCalled();
    });

    it('refuses to send when the sender domain is not verified, with a logged reason (AC-4)', async () => {
      const { deps, logger } = buildDeps();
      deps.checkSender.mockResolvedValueOnce({
        ok: false,
        domain: 'jobscout.example',
        reason: 'SES domain jobscout.example is not verified for sending',
      } as never);

      const result = await deliverDigest(recipient(), [buildMatch('job-a')], {}, deps);

      expect(result).toEqual({
        status: 'skipped',
        reason: 'sender-unverified',
        matchIds: ['job-a'],
      });
      expect(deps.sendEmail).not.toHaveBeenCalled();
      expect(deps.getRecipientStatus).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'SES domain jobscout.example is not verified for sending',
        }),
        expect.any(String),
      );
    });
  });

  describe('sandbox recipient status', () => {
    it('skips an unverified recipient: no send, no stamp, logged (AC-6)', async () => {
      const { deps, store, logger } = buildDeps([buildMatch('job-a')]);
      deps.getRecipientStatus.mockResolvedValueOnce('PENDING' as never);

      const result = await deliverDigest(
        recipient({ emailVerificationStatus: 'PENDING' }),
        [],
        {},
        deps,
      );

      expect(result).toEqual({
        status: 'skipped',
        reason: 'recipient-unverified',
        matchIds: ['job-a'],
      });
      expect(deps.getRecipientStatus).toHaveBeenCalledWith('user@example.com');
      expect(deps.sendEmail).not.toHaveBeenCalled();
      expect(deps.markMatchSent).not.toHaveBeenCalled();
      expect(store.get('job-a')?.sentAt).toBeUndefined();
      expect(deps.saveRecipientStatus).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reason: 'recipient-unverified' }),
        }),
      );
    });

    it('refreshes a PENDING status, caches VERIFIED, and sends (AC-5)', async () => {
      const { deps } = buildDeps([buildMatch('job-a')]);

      const result = await deliverDigest(
        recipient({ emailVerificationStatus: 'PENDING' }),
        [],
        {},
        deps,
      );

      expect(result.status).toBe('sent');
      expect(deps.saveRecipientStatus).toHaveBeenCalledWith(
        'user-1',
        'user@example.com',
        'VERIFIED',
      );
    });

    it('does not ask SES again for a cached VERIFIED status', async () => {
      const { deps } = buildDeps([buildMatch('job-a')]);

      await deliverDigest(recipient(), [], {}, deps);

      expect(deps.getRecipientStatus).not.toHaveBeenCalled();
    });

    it('sends without a recipient check when sandbox mode is off (AC-7)', async () => {
      const { deps } = buildDeps([buildMatch('job-a')]);
      deps.getRecipientStatus.mockResolvedValueOnce(null as never);

      const result = await deliverDigest(
        recipient({ emailVerificationStatus: 'NOT_REQUESTED' }),
        [],
        {},
        deps,
      );

      expect(result.status).toBe('sent');
      expect(deps.saveRecipientStatus).not.toHaveBeenCalled();
    });

    it('still skips when caching the refreshed status fails', async () => {
      const { deps, logger } = buildDeps([buildMatch('job-a')]);
      deps.getRecipientStatus.mockResolvedValueOnce('PENDING' as never);
      deps.saveRecipientStatus.mockRejectedValueOnce(new Error('ddb down'));

      const result = await deliverDigest(
        recipient({ emailVerificationStatus: 'NOT_REQUESTED' }),
        [],
        {},
        deps,
      );

      expect(result).toMatchObject({ status: 'skipped', reason: 'recipient-unverified' });
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('send failures (AC-10, M5)', () => {
    it('leaves matches unstamped when SES rejects the email', async () => {
      const { deps, store } = buildDeps([buildMatch('job-a')]);
      deps.sendEmail.mockRejectedValue(sesError('MessageRejected'));

      const result = await deliverDigest(recipient(), [], {}, deps);

      expect(result).toEqual({
        status: 'failed',
        reason: 'permanent',
        matchIds: ['job-a'],
        error: 'MessageRejected: MessageRejected',
      });
      expect(deps.sendEmail).toHaveBeenCalledTimes(1);
      expect(deps.markMatchSent).not.toHaveBeenCalled();
      expect(store.get('job-a')?.sentAt).toBeUndefined();
    });

    it('retries a transient error and then sends', async () => {
      const { deps, logger } = buildDeps([buildMatch('job-a')]);
      deps.sendEmail.mockRejectedValueOnce(sesError('TooManyRequestsException', 429));

      const result = await deliverDigest(recipient(), [], {}, deps);

      expect(result.status).toBe('sent');
      expect(deps.sendEmail).toHaveBeenCalledTimes(2);
      expect(deps.sleep).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId: 'user-1', attempt: 1 } }),
      );
    });

    it('gives up after the bounded number of attempts', async () => {
      const { deps, store } = buildDeps([buildMatch('job-a')]);
      deps.sendEmail.mockRejectedValue(sesError('ServiceUnavailable', 503));

      const result = await deliverDigest(recipient(), [], {}, { ...deps, maxAttempts: 3 });

      expect(result).toMatchObject({ status: 'failed', reason: 'transient' });
      expect(deps.sendEmail).toHaveBeenCalledTimes(3);
      expect(store.get('job-a')?.sentAt).toBeUndefined();
    });

    it('returns a failure instead of throwing when the match query fails', async () => {
      const { deps } = buildDeps();
      deps.loadUnsentMatches.mockRejectedValueOnce(new Error('ddb down'));

      const result = await deliverDigest(recipient(), [buildMatch('job-a')], {}, deps);

      expect(result).toMatchObject({ status: 'failed', reason: 'permanent' });
      expect(deps.sendEmail).not.toHaveBeenCalled();
    });

    it('reports a match whose stamp failed after SES accepted the email', async () => {
      const { deps, logger } = buildDeps([buildMatch('job-a'), buildMatch('job-b')]);
      deps.markMatchSent.mockImplementationOnce(async () => {
        throw new Error('ddb down');
      });

      const result = await deliverDigest(recipient(), [], {}, deps);

      expect(result).toMatchObject({ status: 'sent', unstampedMatchIds: ['job-a'] });
      expect(deps.markMatchSent).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });
});
