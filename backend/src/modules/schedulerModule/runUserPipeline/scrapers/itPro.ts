import * as cheerio from 'cheerio';

import type { ScrapedJob, ScraperSource } from '../types';
import type { PortalHttpClient } from './httpClient';
import { portalHttpClient } from './httpClient';
import {
  canonicalUrl,
  cleanText,
  findJsonLdObjects,
  htmlToText,
  isTitleRelevant,
  selectedRoles,
  uniqueLimitedJobs,
} from './normalize';

export const ITPRO_BASE_URL = process.env.ITPRO_BASE_URL ?? 'https://itpro.lk';

type Listing = Omit<ScrapedJob, 'rawDescription'> & { summary: string };

export const parseItProListings = (html: string): Listing[] => {
  const $ = cheerio.load(html);
  const jobs: Listing[] = [];

  $('#job-listings ul.jc-list article.job-card').each((_, element) => {
    const card = $(element);
    const href = card.find('a.jcl[href]').first().attr('href');
    const title = cleanText(card.find('.jc-title').first().text());
    const company = cleanText(card.find('.jc-company').first().text());
    if (!href || !title || !company) return;

    jobs.push({
      sourceSite: 'itpro.lk',
      title,
      company,
      url: canonicalUrl(href, ITPRO_BASE_URL),
      summary: cleanText(card.text()),
    });
  });

  return jobs;
};

const parseItProDetail = (html: string, listing: Listing): ScrapedJob => {
  const $ = cheerio.load(html);
  const posting = findJsonLdObjects(html).find((object) => object['@type'] === 'JobPosting');
  const organization = posting?.hiringOrganization;
  const structuredCompany =
    organization && typeof organization === 'object' && !Array.isArray(organization)
      ? (organization as Record<string, unknown>).name
      : undefined;
  const structuredDescription = typeof posting?.description === 'string' ? posting.description : '';
  const canonical = $('link[rel="canonical"][href]').first().attr('href');

  return {
    sourceSite: 'itpro.lk',
    title: typeof posting?.title === 'string' ? cleanText(posting.title) : listing.title,
    company: typeof structuredCompany === 'string' ? cleanText(structuredCompany) : listing.company,
    url: canonical ? canonicalUrl(canonical, ITPRO_BASE_URL) : listing.url,
    rawDescription:
      htmlToText(structuredDescription) ||
      cleanText($('section#job-description').first().text()) ||
      listing.summary,
  };
};

export const createItProScraper = (http: PortalHttpClient = portalHttpClient): ScraperSource =>
  Object.assign(
    async (targetRoles: string[]): Promise<ScrapedJob[]> => {
      const listings: Listing[] = [];
      for (const role of selectedRoles(targetRoles)) {
        const html = await http.postForm(new URL('/search/', ITPRO_BASE_URL).toString(), {
          keywords: role,
          search_hp: '',
        });
        listings.push(...parseItProListings(html));
      }

      const relevantListings = listings.filter((job) => isTitleRelevant(job.title, targetRoles));
      const uniqueListings = uniqueLimitedJobs(
        relevantListings.map(({ summary, ...job }) => ({ ...job, rawDescription: summary })),
      );
      const summaries = new Map(listings.map((job) => [job.url, job.summary]));
      const jobs: ScrapedJob[] = [];
      for (const listing of uniqueListings) {
        const listingWithSummary: Listing = {
          ...listing,
          summary: summaries.get(listing.url) ?? listing.rawDescription,
        };
        try {
          jobs.push(parseItProDetail(await http.getText(listing.url), listingWithSummary));
        } catch {
          jobs.push({ ...listing, rawDescription: listingWithSummary.summary });
        }
      }
      return jobs;
    },
    { sourceSite: 'itpro.lk' as const },
  );
