import axios from 'axios';
import * as cheerio from 'cheerio';

import type { ScrapedJob, ScraperSource } from './types';

/** Overridable via env for local/offline testing against a mock server. */
export const TOPJOBS_BASE_URL = process.env.TOPJOBS_BASE_URL ?? 'https://www.topjobs.lk';

export type FetchHtml = (url: string) => Promise<string>;

export const axiosFetchHtml: FetchHtml = (url) => axios.get(url).then((res) => res.data as string);

/**
 * CSS selectors for the TopJobs.lk search-results listing page.
 *
 * NOT VERIFIED against a live fetch of topjobs.lk in this task — these are
 * best-effort placeholders based on typical listing markup. Confirm the
 * real selectors against the live site (e.g. via browser devtools) before
 * running this scraper against production. See commit message.
 */
const SELECTORS = {
  listItem: '.job-listing-item',
  title: '.job-title',
  company: '.job-company',
  link: 'a.job-link',
};

/**
 * Builds a `ScraperSource` for TopJobs.lk. `fetchHtml` is injectable so
 * tests can supply fixture HTML without any real network access.
 */
export const scrapeTopJobs = (fetchHtml: FetchHtml = axiosFetchHtml): ScraperSource =>
  async (targetRoles: string[]): Promise<ScrapedJob[]> => {
    const seenUrls = new Set<string>();
    const jobs: ScrapedJob[] = [];

    for (const role of targetRoles) {
      const searchUrl = `${TOPJOBS_BASE_URL}/jobs?q=${encodeURIComponent(role)}`;
      const html = await fetchHtml(searchUrl);
      const $ = cheerio.load(html);

      $(SELECTORS.listItem).each((_, element) => {
        const node = $(element);
        const title = node.find(SELECTORS.title).text().trim();
        const company = node.find(SELECTORS.company).text().trim();
        const url = node.find(SELECTORS.link).attr('href')?.trim();
        const rawDescription = node.text().trim();

        if (!title || !company || !url || seenUrls.has(url)) {
          return;
        }

        seenUrls.add(url);
        jobs.push({ sourceSite: 'topjobs.lk', title, company, url, rawDescription });
      });
    }

    return jobs;
  };
