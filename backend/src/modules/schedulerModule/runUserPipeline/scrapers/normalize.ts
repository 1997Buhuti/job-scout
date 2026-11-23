import * as cheerio from 'cheerio';

import { MAX_JOBS_PER_SOURCE, MAX_SEARCH_ROLES_PER_SOURCE } from '@common/costLimits';

import type { ScrapedJob } from '../types';

export const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const htmlToText = (html: string): string => cleanText(cheerio.load(html).text());

export const selectedRoles = (targetRoles: string[]): string[] =>
  [...new Set(targetRoles.map(cleanText).filter(Boolean))].slice(0, MAX_SEARCH_ROLES_PER_SOURCE);

const GENERIC_ROLE_TOKENS = new Set([
  'engineer',
  'developer',
  'specialist',
  'manager',
  'senior',
  'junior',
  'intern',
]);

const words = (value: string): string[] =>
  value.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/**
 * Portal searches can return broad matches such as every title containing
 * "engineer". Require at least one distinctive role word in the title before
 * accepting a listing; fall back to any role word for generic roles.
 */
export const isTitleRelevant = (title: string, targetRoles: string[]): boolean => {
  const titleWords = new Set(words(title));
  return targetRoles.some((role) => {
    const roleWords = words(role).filter((word) => word.length >= 3);
    const distinctive = roleWords.filter((word) => !GENERIC_ROLE_TOKENS.has(word));
    const required = distinctive.length > 0 ? distinctive : roleWords;
    return required.some((word) => titleWords.has(word));
  });
};

export const canonicalUrl = (rawUrl: string, baseUrl: string): string => {
  const url = new URL(rawUrl, baseUrl);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  return url.toString();
};

export const uniqueLimitedJobs = (jobs: ScrapedJob[]): ScrapedJob[] => {
  const seen = new Set<string>();
  const result: ScrapedJob[] = [];
  for (const job of jobs) {
    if (seen.has(job.url)) continue;
    seen.add(job.url);
    result.push(job);
    if (result.length >= MAX_JOBS_PER_SOURCE) break;
  }
  return result;
};

export const findJsonLdObjects = (html: string): Record<string, unknown>[] => {
  const $ = cheerio.load(html);
  const objects: Record<string, unknown>[] = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const parsed = JSON.parse($(element).text()) as unknown;
      const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (queue.length > 0) {
        const value = queue.shift();
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const object = value as Record<string, unknown>;
        objects.push(object);
        const graph = object['@graph'];
        if (Array.isArray(graph)) queue.push(...graph);
      }
    } catch {
      // Ignore malformed structured data and let the adapter use HTML fallbacks.
    }
  });

  return objects;
};
