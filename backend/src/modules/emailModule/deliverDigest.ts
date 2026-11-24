import { SCHEDULER_SERVICE } from '@common/constants';
import { Logger } from '@common/logger';
import type { EmailVerificationStatus } from '@modules/profileModule/getProfile/types';
import type { MatchResult } from '@modules/schedulerModule/runUserPipeline/types';

import type { DigestJob } from './buildDigest';
import { buildDigest } from './buildDigest';
import {
  loadDigestJobs,
  loadUnsentMatches,
  markMatchSent,
  MATCH_SCORE_THRESHOLD,
  saveRecipientStatus,
} from './digestStore';
import { getRecipientStatus } from './recipientStatus';
import type { SenderCheckResult } from './senderCheck';
import { checkSenderDomain } from './senderCheck';
import type { SendDigestEmail } from './sesSend';
import { isTransientSesError, sendDigestEmail, withSesRetry } from './sesSend';

const SES_FROM_ADDRESS_ENV_KEY = 'SES_FROM_ADDRESS';

/** Profile fields the delivery checks read. */
export interface DigestRecipient {
  userId: string;
  email: string;
  schedulerEnabled?: boolean;
  emailSuppressed?: boolean;
  emailVerificationStatus?: EmailVerificationStatus;
}

export type DigestSkipReason =
  | 'no-unsent-matches'
  | 'missing-email'
  | 'suppressed'
  | 'unsubscribed'
  | 'sender-unverified'
  | 'recipient-unverified';

export type DeliverDigestResult =
  | { status: 'sent'; matchIds: string[]; messageId?: string; unstampedMatchIds?: string[] }
  | { status: 'skipped'; reason: DigestSkipReason; matchIds: string[] }
  | { status: 'failed'; reason: 'permanent' | 'transient'; matchIds: string[]; error: string };

export interface DeliverDigestDeps {
  loadUnsentMatches?: (userId: string) => Promise<MatchResult[]>;
  loadDigestJobs?: (jobIds: string[]) => Promise<Record<string, DigestJob>>;
  checkSender?: (fromAddress: string | undefined) => Promise<SenderCheckResult>;
  getRecipientStatus?: (email: string) => Promise<EmailVerificationStatus | null>;
  saveRecipientStatus?: (
    userId: string,
    email: string,
    status: EmailVerificationStatus,
  ) => Promise<void>;
  sendEmail?: SendDigestEmail;
  markMatchSent?: (match: MatchResult, sentAt: string) => Promise<void>;
  /** Total SES attempts per call, including the first. */
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  fromAddress?: string;
  logger?: Logger;
  now?: () => Date;
}

const errorMessage = (err: unknown): string =>
  err instanceof Error ? `${err.name}: ${err.message}` : String(err);

/**
 * This run's new qualifying matches plus older ones that never got
 * `sentAt`. New matches come first in the merge because the GSI read is
 * eventually consistent and may not include matches written seconds ago.
 */
const collectUnsent = (newMatches: MatchResult[], stored: MatchResult[]): MatchResult[] => {
  const byJobId = new Map<string, MatchResult>();
  for (const match of [...newMatches, ...stored]) {
    if (match.sentAt || match.matchScore < MATCH_SCORE_THRESHOLD) continue;
    if (!byJobId.has(match.jobId)) {
      byJobId.set(match.jobId, match);
    }
  }
  return [...byJobId.values()];
};

/**
 * M2 / FR-4: delivers one digest of every unsent qualifying match, checking
 * in this order: unsent matches, suppressed, unsubscribed, sender domain,
 * sandbox recipient status, then send. It never throws. Skips and failures
 * come back as results with a reason, and matches keep no `sentAt` unless
 * SES accepted the email.
 */
export const deliverDigest = async (
  recipient: DigestRecipient,
  newMatches: MatchResult[],
  jobsById: Record<string, DigestJob>,
  deps: DeliverDigestDeps = {},
): Promise<DeliverDigestResult> => {
  const logger = deps.logger ?? new Logger(SCHEDULER_SERVICE);
  const retry = { maxAttempts: deps.maxAttempts, sleep: deps.sleep };
  const { userId } = recipient;
  let matchIds: string[] = [];

  const skip = (reason: DigestSkipReason, message: string): DeliverDigestResult => {
    logger.info({ message, data: { userId, reason, matchCount: matchIds.length } });
    return { status: 'skipped', reason, matchIds };
  };

  try {
    // 1. Unsent matches.
    const stored = await (deps.loadUnsentMatches ?? loadUnsentMatches)(userId);
    const unsent = collectUnsent(newMatches, stored);
    matchIds = unsent.map((match) => match.jobId);
    if (unsent.length === 0) {
      return skip('no-unsent-matches', 'Digest skipped: no unsent qualifying matches');
    }

    // A profile created before the email field existed has none until its
    // next GET /me/profile backfills it (FR-8).
    if (!recipient.email) {
      return skip('missing-email', 'Digest skipped: profile has no email address');
    }

    // 2. Suppressed after a bounce or complaint.
    if (recipient.emailSuppressed) {
      return skip('suppressed', 'Digest skipped: recipient is suppressed');
    }

    // 3. Unsubscribed.
    if (recipient.schedulerEnabled === false) {
      return skip('unsubscribed', 'Digest skipped: recipient has unsubscribed');
    }

    // 4. Sender domain verified for sending.
    const fromAddress = deps.fromAddress ?? process.env[SES_FROM_ADDRESS_ENV_KEY];
    const sender = await withSesRetry(
      () => (deps.checkSender ?? checkSenderDomain)(fromAddress),
      retry,
    );
    if (!sender.ok) {
      logger.error(
        new Error(sender.reason ?? 'Sender domain is not verified'),
        'Digest not sent: sender domain is not verified in SES',
      );
      return { status: 'skipped', reason: 'sender-unverified', matchIds };
    }

    // 5. Sandbox only: recipient verified. `getRecipientStatus` returns
    // null without calling SES when sandbox mode is off.
    if (recipient.emailVerificationStatus !== 'VERIFIED') {
      const status = await withSesRetry(
        () => (deps.getRecipientStatus ?? getRecipientStatus)(recipient.email),
        retry,
      );
      if (status !== null) {
        if (status !== (recipient.emailVerificationStatus ?? 'NOT_REQUESTED')) {
          await cacheRecipientStatus(recipient, status, deps, logger);
        }
        if (status !== 'VERIFIED') {
          return skip(
            'recipient-unverified',
            'Digest skipped: recipient is not verified in SES (sandbox mode)',
          );
        }
      }
    }

    // 6. Send.
    const missingJobIds = matchIds.filter((jobId) => !jobsById[jobId]);
    const jobs =
      missingJobIds.length > 0
        ? { ...(await (deps.loadDigestJobs ?? loadDigestJobs)(missingJobIds)), ...jobsById }
        : jobsById;
    const content = buildDigest(unsent, jobs);
    const sendEmail = deps.sendEmail ?? sendDigestEmail;
    const { messageId } = await withSesRetry(
      () =>
        sendEmail({
          to: recipient.email,
          from: fromAddress as string,
          subject: content.subject,
          html: content.html,
          text: content.text,
        }),
      {
        ...retry,
        onRetry: (attempt, err) =>
          logger.warn({
            message: 'Transient SES error sending digest; retrying',
            data: { userId, attempt },
            error: errorMessage(err),
          }),
      },
    );

    // 7. Stamp sentAt only now that SES has accepted the email.
    const unstampedMatchIds = await stampSent(unsent, deps, logger, userId);
    logger.info({
      message: 'Digest sent',
      data: { userId, matchCount: unsent.length, messageId },
    });
    return {
      status: 'sent',
      matchIds,
      messageId,
      ...(unstampedMatchIds.length > 0 ? { unstampedMatchIds } : {}),
    };
  } catch (err) {
    const reason = isTransientSesError(err) ? 'transient' : 'permanent';
    logger.error(err, `Digest delivery failed (${reason}); matches stay unsent`);
    return { status: 'failed', reason, matchIds, error: errorMessage(err) };
  }
};

/** Best effort: a failed cache write is logged, and SES is asked again next run. */
const cacheRecipientStatus = async (
  recipient: DigestRecipient,
  status: EmailVerificationStatus,
  deps: DeliverDigestDeps,
  logger: Logger,
): Promise<void> => {
  try {
    await (deps.saveRecipientStatus ?? saveRecipientStatus)(
      recipient.userId,
      recipient.email,
      status,
    );
  } catch (err) {
    logger.warn({
      message: 'Could not cache recipient verification status',
      data: { userId: recipient.userId, emailVerificationStatus: status },
      error: errorMessage(err),
    });
  }
};

/**
 * The email is already out, so a failed stamp is logged instead of thrown.
 * That match goes out again in the next digest, which is better than
 * failing the run and re-scraping every hour.
 */
const stampSent = async (
  matches: MatchResult[],
  deps: DeliverDigestDeps,
  logger: Logger,
  userId: string,
): Promise<string[]> => {
  const markSent = deps.markMatchSent ?? markMatchSent;
  const sentAt = (deps.now ?? (() => new Date()))().toISOString();
  const unstamped: string[] = [];

  for (const match of matches) {
    try {
      await markSent(match, sentAt);
    } catch (err) {
      unstamped.push(match.jobId);
      logger.error(err, `Could not stamp sentAt on match ${match.jobId} for user ${userId}`);
    }
  }
  return unstamped;
};
