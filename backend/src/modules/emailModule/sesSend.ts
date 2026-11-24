import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';

// Retries are owned by `withSesRetry` so the attempt count is bounded in
// one place; the SDK's own retry is turned off.
const sesClient = new SESv2Client({ region: 'us-east-1', maxAttempts: 1 });

export interface EmailHeader {
  name: string;
  value: string;
}

export interface DigestEmail {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
  headers?: EmailHeader[];
}

export type SendDigestEmail = (email: DigestEmail) => Promise<{ messageId?: string }>;

/** C3: one SES v2 `SendEmail` call with HTML and text bodies and optional headers. */
export const sendDigestEmail: SendDigestEmail = async (email) => {
  const headers = email.headers?.map(({ name, value }) => ({ Name: name, Value: value }));

  const output = await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: email.from,
      Destination: { ToAddresses: [email.to] },
      Content: {
        Simple: {
          Subject: { Data: email.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: email.html, Charset: 'UTF-8' },
            Text: { Data: email.text, Charset: 'UTF-8' },
          },
          ...(headers && headers.length > 0 ? { Headers: headers } : {}),
        },
      },
    }),
  );

  return { messageId: output.MessageId };
};

const TRANSIENT_ERROR_NAMES = new Set([
  'TooManyRequestsException',
  'ThrottlingException',
  'Throttling',
  'InternalFailure',
  'InternalServerError',
  'ServiceUnavailable',
  'ServiceUnavailableException',
  'RequestTimeout',
  'RequestTimeoutException',
  'TimeoutError',
]);

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
]);

/**
 * Throttling, 5xx, and network errors are transient. Everything else (for
 * example `MessageRejected`, `AccessDeniedException`, `SendingPausedException`)
 * is permanent: retrying the same request won't change the answer.
 */
export const isTransientSesError = (err: unknown): boolean => {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const candidate = err as {
    name?: unknown;
    code?: unknown;
    $retryable?: unknown;
    $metadata?: { httpStatusCode?: number };
  };
  if (candidate.$retryable) {
    return true;
  }
  if (typeof candidate.name === 'string' && TRANSIENT_ERROR_NAMES.has(candidate.name)) {
    return true;
  }
  if (typeof candidate.code === 'string' && TRANSIENT_NETWORK_CODES.has(candidate.code)) {
    return true;
  }
  const status = candidate.$metadata?.httpStatusCode;
  return status === 429 || (typeof status === 'number' && status >= 500);
};

export const DEFAULT_SES_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 250;

export const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface SesRetryOptions {
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, err: unknown) => void;
}

/**
 * M5: runs `fn`, retrying transient SES errors with exponential backoff
 * (250 ms, 500 ms, ...) up to `maxAttempts` total attempts. A permanent
 * error, or the last transient one, is rethrown.
 */
export const withSesRetry = async <T>(
  fn: () => Promise<T>,
  options: SesRetryOptions = {},
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? DEFAULT_SES_MAX_ATTEMPTS;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts || !isTransientSesError(err)) {
        throw err;
      }
      options.onRetry?.(attempt, err);
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
};
