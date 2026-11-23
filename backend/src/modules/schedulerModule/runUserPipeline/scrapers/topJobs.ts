import * as cheerio from 'cheerio';

import type { ScrapedJob, ScraperSource, SourceSite } from '../types';
import type { PortalHttpClient } from './httpClient';
import { portalHttpClient } from './httpClient';
import { cleanText, isTitleRelevant, selectedRoles, uniqueLimitedJobs } from './normalize';

export const TOPJOBS_BASE_URL = process.env.TOPJOBS_BASE_URL ?? 'https://www.topjobs.lk';
const SEARCH_PATH = '/applicant/vacancybyfunctionalarea.jsp';

const detailUrl = (agentCode: string, jobCode: string, employerCode: string): string => {
  const url = new URL('/employer/JobAdvertismentServlet', TOPJOBS_BASE_URL);
  url.searchParams.set('ac', agentCode);
  url.searchParams.set('jc', jobCode);
  url.searchParams.set('ec', employerCode);
  return url.toString();
};

export const parseTopJobsListings = (
  html: string,
  sourceSite: SourceSite = 'topjobs.lk',
): ScrapedJob[] => {
  const $ = cheerio.load(html);
  const jobs: ScrapedJob[] = [];

  $('#table tr').each((_, element) => {
    const row = $(element);
    const jobCode = cleanText(row.find('span[id^="hdnJC"]').first().text());
    const employerCode = cleanText(row.find('span[id^="hdnEC"]').first().text());
    const agentCode = cleanText(row.find('span[id^="hdnAC"]').first().text());
    const cells = row.children('td');
    const title = cleanText(cells.eq(2).find('h2').first().text()).replace(/\s*\(\d+\)\s*$/, '');
    const company = cleanText(cells.eq(2).find('h1').first().text());

    if (!jobCode || !employerCode || !agentCode || !title || !company) return;

    const summary = cleanText(cells.eq(3).text());
    const location = cleanText(cells.eq(6).text());
    const closingDate = cleanText(cells.eq(5).text());
    const rawDescription = cleanText(
      [title, company, summary, location && `Location: ${location}`, closingDate && `Closes: ${closingDate}`]
        .filter(Boolean)
        .join('. '),
    );

    jobs.push({
      sourceSite,
      title,
      company,
      url: detailUrl(agentCode, jobCode, employerCode),
      rawDescription,
    });
  });

  return jobs;
};

export const createTopJobsScraper = (
  http: PortalHttpClient = portalHttpClient,
  sourceSite: SourceSite = 'topjobs.lk',
): ScraperSource =>
  Object.assign(
    async (targetRoles: string[]): Promise<ScrapedJob[]> => {
      const jobs: ScrapedJob[] = [];
      for (const role of selectedRoles(targetRoles)) {
        const url = new URL(SEARCH_PATH, TOPJOBS_BASE_URL);
        url.searchParams.set('txtKeyWord', role);
        url.searchParams.set('jst', 'OPEN');
        jobs.push(...parseTopJobsListings(await http.getText(url.toString()), sourceSite));
      }
      return uniqueLimitedJobs(jobs.filter((job) => isTitleRelevant(job.title, targetRoles)));
    },
    { sourceSite },
  );
