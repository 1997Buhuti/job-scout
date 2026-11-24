import type { DigestJob } from '@modules/emailModule/buildDigest';
import { buildDigest, safeJobUrl } from '@modules/emailModule/buildDigest';
import { MAX_REASONING_CHARS } from '@modules/schedulerModule/runUserPipeline/reasoning';
import type { MatchResult } from '@modules/schedulerModule/runUserPipeline/types';

const buildMatch = (jobId: string, overrides: Partial<MatchResult> = {}): MatchResult => ({
  partitionKey: `user-1#${jobId}`,
  userId: 'user-1',
  jobId,
  matchScore: 80,
  reasoning: 'Matches the TypeScript and AWS experience.',
  matchingSkills: [],
  evaluatedAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

const job = (overrides: Partial<DigestJob> = {}): DigestJob => ({
  title: 'Software Engineer',
  company: 'Acme',
  url: 'https://jobs.example/a',
  ...overrides,
});

/** Visible text of the HTML part, for comparing with the text part. */
const htmlText = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

describe('safeJobUrl', () => {
  it.each(['https://jobs.example/a?b=1', 'http://jobs.example/a'])('keeps %p', (url) => {
    expect(safeJobUrl(url)).toBe(url);
  });

  it.each([
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox',
    'mailto:a@b.c',
    '/relative/path',
    'not a url',
    '',
    undefined,
  ])('drops %p', (url) => {
    expect(safeJobUrl(url)).toBeNull();
  });
});

describe('buildDigest (C1, FR-5)', () => {
  it('states the match count in the subject', () => {
    expect(buildDigest([buildMatch('a')], { a: job() }).subject).toBe('Job Scout: 1 new job match');
    expect(
      buildDigest([buildMatch('a'), buildMatch('b')], { a: job(), b: job() }).subject,
    ).toBe('Job Scout: 2 new job matches');
  });

  it('escapes job-derived text in the HTML part', () => {
    const { html } = buildDigest(
      [buildMatch('a', { reasoning: 'Uses <b>React</b> & "Node"' })],
      { a: job({ title: '<script>alert(1)</script>', company: "O'Reilly & Sons" }) },
    );

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('O&#39;Reilly &amp; Sons');
    expect(html).toContain('Uses &lt;b&gt;React&lt;/b&gt; &amp; &quot;Node&quot;');
  });

  it('writes only http and https links', () => {
    const { html, text } = buildDigest(
      [buildMatch('good'), buildMatch('bad')],
      {
        good: job({ title: 'Good', url: 'https://jobs.example/good' }),
        bad: job({ title: 'Bad', url: 'javascript:alert(document.cookie)' }),
      },
    );

    expect(html).toContain('<a href="https://jobs.example/good">Good</a>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<strong>Bad</strong>');
    expect(text).not.toContain('javascript:');
  });

  it('escapes quotes inside an allowed link', () => {
    const { html } = buildDigest([buildMatch('a')], {
      a: job({ url: 'https://jobs.example/a?q="x"' }),
    });

    expect(html).toContain('href="https://jobs.example/a?q=%22x%22"');
  });

  it('has the same content in the text and HTML parts', () => {
    const matches = [
      buildMatch('a', { matchScore: 70, reasoning: 'Strong backend fit & AWS.' }),
      buildMatch('b', { matchScore: 91, reasoning: 'Exact role match.' }),
    ];
    const jobs = {
      a: job({ title: 'Backend <Dev>', company: 'Acme', url: 'https://jobs.example/a' }),
      b: job({ title: 'Platform Engineer', company: 'Beta', url: 'https://jobs.example/b' }),
    };

    const { html, text } = buildDigest(matches, jobs);
    const visible = htmlText(html);

    for (const value of [
      'Backend <Dev>',
      'Platform Engineer',
      'Acme',
      'Beta',
      'Match score: 70',
      'Match score: 91',
      'Strong backend fit & AWS.',
      'Exact role match.',
    ]) {
      expect(text).toContain(value);
      expect(visible).toContain(value);
    }
    expect(text).toContain('https://jobs.example/a');
    expect(html).toContain('https://jobs.example/a');
    // Highest score first in both parts.
    expect(text.indexOf('Platform Engineer')).toBeLessThan(text.indexOf('Backend <Dev>'));
    expect(html.indexOf('Platform Engineer')).toBeLessThan(html.indexOf('Backend &lt;Dev&gt;'));
  });

  it('caps each reason at 200 characters (AC-11)', () => {
    const long = 'word '.repeat(100);
    const { html, text } = buildDigest([buildMatch('a', { reasoning: long })], { a: job() });

    const reasonLine = text.split('\n').find((line) => line.includes('word'))?.trim() ?? '';
    expect(reasonLine.length).toBeLessThanOrEqual(MAX_REASONING_CHARS);
    expect(reasonLine.endsWith('…')).toBe(true);
    expect(htmlText(html)).not.toContain(long.trim());
  });

  it('falls back when the job details are missing', () => {
    const { html, text } = buildDigest([buildMatch('gone')], {});

    expect(text).toContain('1. Untitled job');
    expect(html).toContain('<strong>Untitled job</strong>');
    expect(html).not.toContain('href=');
  });
});
