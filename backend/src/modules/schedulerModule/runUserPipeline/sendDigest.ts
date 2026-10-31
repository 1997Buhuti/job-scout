import { SendEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { ApplicationError, DatabaseError } from '@common/ErrorTypes';

import type { JobPosting, MatchResult } from './types';

const MATCHES_TABLE_ENV_KEY = 'MATCHES_TABLE_NAME';
const SES_FROM_ADDRESS_ENV_KEY = 'SES_FROM_ADDRESS';

/** MVP cutoff for what counts as a "high-score" match worth emailing. */
export const MATCH_SCORE_THRESHOLD = 60;

const sesClient = new SESClient({ region: 'us-east-1' });
const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

const resolveMatchesTable = (): string => {
  const tableName = process.env[MATCHES_TABLE_ENV_KEY];
  if (!tableName) {
    throw new DatabaseError(`Missing required environment variable ${MATCHES_TABLE_ENV_KEY}`);
  }
  return tableName;
};

const resolveFromAddress = (): string => {
  const from = process.env[SES_FROM_ADDRESS_ENV_KEY];
  if (!from) {
    throw new ApplicationError(`Missing required environment variable ${SES_FROM_ADDRESS_ENV_KEY}`);
  }
  return from;
};

export interface DigestEmailParams {
  to: string;
  from: string;
  subject: string;
  html: string;
}

export type SendDigestEmail = (params: DigestEmailParams) => Promise<void>;
export type UpdateMatchSentAt = (match: MatchResult, sentAt: string) => Promise<void>;

const defaultSendEmail: SendDigestEmail = async ({ to, from, subject, html }) => {
  await sesClient.send(
    new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    }),
  );
};

const defaultUpdateSentAt: UpdateMatchSentAt = async (match, sentAt) => {
  const tableName = resolveMatchesTable();
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { PK: match.partitionKey, SK: 'MATCH' },
      UpdateExpression: 'SET sentAt = :sentAt',
      ExpressionAttributeValues: { ':sentAt': sentAt },
    }),
  );
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });

const buildDigestHtml = (
  matches: MatchResult[],
  jobsById: Record<string, JobPosting>,
): string => {
  const rows = matches
    .map((match) => {
      const job = jobsById[match.jobId];
      const title = escapeHtml(job?.title ?? match.jobId);
      const company = escapeHtml(job?.company ?? '');
      const url = job?.url ?? '#';
      const reasoning = escapeHtml(match.reasoning);
      return (
        `<li><a href="${url}">${title}</a> at ${company} — match score ${match.matchScore}` +
        `<br/>${reasoning}</li>`
      );
    })
    .join('');

  return `<h1>New job matches</h1><ul>${rows}</ul>`;
};

export interface SendDigestDeps {
  sendEmail?: SendDigestEmail;
  updateSentAt?: UpdateMatchSentAt;
}

export interface SendDigestResult {
  sent: boolean;
  matchIds?: string[];
}

/**
 * B8: sends one SES HTML digest for this run's new high-score matches
 * (`matchScore >= MATCH_SCORE_THRESHOLD`) and stamps `sentAt` on each
 * included `MatchResult`. Sends nothing — not even a zero-match email —
 * when no match qualifies.
 */
export const sendDigestForUser = async (
  userEmail: string,
  newMatches: MatchResult[],
  jobsById: Record<string, JobPosting>,
  deps: SendDigestDeps = {},
): Promise<SendDigestResult> => {
  const sendEmail = deps.sendEmail ?? defaultSendEmail;
  const updateSentAt = deps.updateSentAt ?? defaultUpdateSentAt;

  const qualifying = newMatches.filter((match) => match.matchScore >= MATCH_SCORE_THRESHOLD);

  if (qualifying.length === 0) {
    return { sent: false };
  }

  const from = resolveFromAddress();
  const subject = `Job Scout: ${qualifying.length} new job match${qualifying.length === 1 ? '' : 'es'}`;
  const html = buildDigestHtml(qualifying, jobsById);

  await sendEmail({ to: userEmail, from, subject, html });

  const sentAt = new Date().toISOString();
  for (const match of qualifying) {
    await updateSentAt(match, sentAt);
  }

  return { sent: true, matchIds: qualifying.map((match) => match.jobId) };
};
