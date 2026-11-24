import { GetEmailIdentityCommand, SESv2Client } from '@aws-sdk/client-sesv2';

const sesClient = new SESv2Client({ region: 'us-east-1' });

/** How long one container trusts a sender check before asking SES again. */
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface SenderCheckResult {
  ok: boolean;
  domain: string | null;
  /** Why sending is refused. Set only when `ok` is false. */
  reason?: string;
}

/** Reads `VerifiedForSendingStatus` and `VerificationStatus` for an identity. */
export type GetSenderIdentity = (
  domain: string,
) => Promise<{ verifiedForSending: boolean; verificationStatus?: string } | null>;

const defaultGetSenderIdentity: GetSenderIdentity = async (domain) => {
  try {
    const identity = await sesClient.send(
      new GetEmailIdentityCommand({ EmailIdentity: domain }),
    );
    return {
      verifiedForSending: identity.VerifiedForSendingStatus === true,
      verificationStatus: identity.VerificationStatus,
    };
  } catch (err) {
    if ((err as { name?: unknown } | null)?.name === 'NotFoundException') {
      return null;
    }
    throw err;
  }
};

/**
 * Domain part of a bare sender address (`digest@example.com`). Returns
 * `null` for anything else, including a `Name <address>` form, because the
 * IAM `ses:FromAddress` condition on the Lambda role expects a bare address.
 */
export const senderDomainOf = (fromAddress: string | undefined): string | null => {
  const match = /^[^\s@<>]+@([^\s@<>]+\.[^\s@<>]+)$/.exec(fromAddress?.trim() ?? '');
  return match ? match[1].toLowerCase() : null;
};

const cache = new Map<string, { result: SenderCheckResult; checkedAt: number }>();

/** Test hook: forget cached checks. */
export const resetSenderCheckCache = (): void => {
  cache.clear();
};

export interface SenderCheckDeps {
  getSenderIdentity?: GetSenderIdentity;
  now?: () => number;
}

/**
 * M1 / FR-2: confirms the sender's domain is verified for sending in SES.
 * The result is cached per Lambda container for `CACHE_TTL_MS`. SES errors
 * other than "not found" are thrown and not cached, so the caller can
 * classify them as transient or permanent.
 */
export const checkSenderDomain = async (
  fromAddress: string | undefined,
  deps: SenderCheckDeps = {},
): Promise<SenderCheckResult> => {
  const getSenderIdentity = deps.getSenderIdentity ?? defaultGetSenderIdentity;
  const now = deps.now ?? Date.now;

  if (!fromAddress?.trim()) {
    return { ok: false, domain: null, reason: 'SES_FROM_ADDRESS is not set' };
  }

  const domain = senderDomainOf(fromAddress);
  if (!domain) {
    return {
      ok: false,
      domain: null,
      reason: 'SES_FROM_ADDRESS must be a bare email address such as digest@example.com',
    };
  }

  const cached = cache.get(domain);
  if (cached && now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const identity = await getSenderIdentity(domain);
  let result: SenderCheckResult;
  if (!identity) {
    result = { ok: false, domain, reason: `No SES identity exists for domain ${domain}` };
  } else if (!identity.verifiedForSending) {
    result = {
      ok: false,
      domain,
      reason: `SES domain ${domain} is not verified for sending (verification status ${identity.verificationStatus ?? 'UNKNOWN'})`,
    };
  } else {
    result = { ok: true, domain };
  }

  cache.set(domain, { result, checkedAt: now() });
  return result;
};
