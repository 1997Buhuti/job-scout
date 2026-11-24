import { truncateReasoning } from '@modules/schedulerModule/runUserPipeline/reasoning';
import type { JobPosting, MatchResult } from '@modules/schedulerModule/runUserPipeline/types';

/** The job fields a digest shows. */
export type DigestJob = Pick<JobPosting, 'title' | 'company' | 'url'>;

export interface DigestContent {
  subject: string;
  html: string;
  text: string;
}

/** One match as it appears in both parts of the email. */
interface DigestItem {
  title: string;
  company: string;
  url: string | null;
  score: number;
  reasoning: string;
}

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

/**
 * Returns the URL only if it parses and uses `http` or `https`. Scraped
 * links are untrusted, so `javascript:`, `data:` and the like are dropped.
 */
export const safeJobUrl = (raw: string | undefined): string | null => {
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

const toItem = (match: MatchResult, job: DigestJob | undefined): DigestItem => ({
  title: job?.title?.trim() || 'Untitled job',
  company: job?.company?.trim() ?? '',
  url: safeJobUrl(job?.url),
  score: match.matchScore,
  reasoning: truncateReasoning(match.reasoning),
});

const renderHtmlItem = (item: DigestItem): string => {
  const title = escapeHtml(item.title);
  const heading = item.url
    ? `<a href="${escapeHtml(item.url)}">${title}</a>`
    : title;
  const company = item.company ? ` at ${escapeHtml(item.company)}` : '';
  return (
    `<li style="margin-bottom:16px">` +
    `<strong>${heading}</strong>${company}<br/>` +
    `Match score: ${item.score}<br/>` +
    `${escapeHtml(item.reasoning)}` +
    `</li>`
  );
};

const renderTextItem = (item: DigestItem, index: number): string => {
  const company = item.company ? ` at ${item.company}` : '';
  const lines = [
    `${index + 1}. ${item.title}${company}`,
    `   Match score: ${item.score}`,
    `   ${item.reasoning}`,
  ];
  if (item.url) {
    lines.push(`   ${item.url}`);
  }
  return lines.join('\n');
};

/**
 * C1 / FR-5: builds the subject, HTML part, and plain-text part of a digest
 * from the same items, highest score first. All job-derived text is escaped
 * in the HTML part, and only `http`/`https` links are written.
 */
export const buildDigest = (
  matches: MatchResult[],
  jobsById: Record<string, DigestJob>,
): DigestContent => {
  const items = [...matches]
    .sort((a, b) => b.matchScore - a.matchScore)
    .map((match) => toItem(match, jobsById[match.jobId]));

  const count = items.length;
  const subject = `Job Scout: ${count} new job match${count === 1 ? '' : 'es'}`;
  const intro = `Job Scout found ${count} job${count === 1 ? '' : 's'} that match your profile.`;

  const html =
    '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.4">' +
    `<h1 style="font-size:20px">New job matches</h1>` +
    `<p>${intro}</p>` +
    `<ul style="padding-left:20px">${items.map(renderHtmlItem).join('')}</ul>` +
    '</body></html>';

  const text = [
    'New job matches',
    '',
    intro,
    '',
    items.map(renderTextItem).join('\n\n'),
    '',
  ].join('\n');

  return { subject, html, text };
};
