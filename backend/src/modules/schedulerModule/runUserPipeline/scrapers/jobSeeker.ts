import type { ScrapedJob, ScraperSource } from '../types';
import type { PortalHttpClient } from './httpClient';
import { portalHttpClient } from './httpClient';
import {
  canonicalUrl,
  cleanText,
  htmlToText,
  isTitleRelevant,
  selectedRoles,
  uniqueLimitedJobs,
} from './normalize';

export const JOBSEEKER_BASE_URL = process.env.JOBSEEKER_BASE_URL ?? 'https://jobseeker.lk';

type WordpressPost = {
  id?: number;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
};

const extractCompany = (text: string): string => {
  const labelled = text.match(/\b(?:company|organization|employer)\s*[:-]\s*([^.|\n]{2,100})/i)?.[1];
  return cleanText(labelled ?? '') || 'Employer not specified';
};

export const parseJobSeekerPosts = (payload: unknown): ScrapedJob[] => {
  if (!Array.isArray(payload)) return [];

  return (payload as WordpressPost[]).flatMap((post) => {
    const title = htmlToText(post.title?.rendered ?? '');
    const description = htmlToText(post.content?.rendered ?? post.excerpt?.rendered ?? '');
    const url = post.link ? canonicalUrl(post.link, JOBSEEKER_BASE_URL) : '';
    if (!post.id || !title || !description || !url) return [];

    return [{
      sourceSite: 'jobseeker.lk' as const,
      title,
      company: extractCompany(description),
      url,
      rawDescription: description,
    }];
  });
};

export const createJobSeekerScraper = (http: PortalHttpClient = portalHttpClient): ScraperSource =>
  Object.assign(
    async (targetRoles: string[]): Promise<ScrapedJob[]> => {
      const jobs: ScrapedJob[] = [];
      for (const role of selectedRoles(targetRoles)) {
        const url = new URL('/wp-json/wp/v2/posts', JOBSEEKER_BASE_URL);
        url.searchParams.set('search', role);
        url.searchParams.set('orderby', 'relevance');
        url.searchParams.set('per_page', '20');
        url.searchParams.set('_fields', 'id,link,title,excerpt,content');
        jobs.push(...parseJobSeekerPosts(await http.getJson(url.toString())));
      }
      return uniqueLimitedJobs(jobs.filter((job) => isTitleRelevant(job.title, targetRoles)));
    },
    { sourceSite: 'jobseeker.lk' as const },
  );
