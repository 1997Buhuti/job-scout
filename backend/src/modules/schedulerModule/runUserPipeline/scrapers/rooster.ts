import type { ScrapedJob, ScraperSource } from '../types';
import type { PortalHttpClient } from './httpClient';
import { portalHttpClient } from './httpClient';
import {
  cleanText,
  htmlToText,
  isTitleRelevant,
  selectedRoles,
  uniqueLimitedJobs,
} from './normalize';

export const ROOSTER_API_URL =
  process.env.ROOSTER_API_URL ?? 'https://api.rooster.jobs/jobSearch/jobs/search';
const ROOSTER_BASE_URL = 'https://rooster.jobs';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readRecords = (payload: unknown): UnknownRecord[] => {
  if (!isRecord(payload)) return [];
  // The public API currently returns `{ body: { data } }`; accept the older
  // `{ response: { body: { data } } }` envelope as well.
  const response = isRecord(payload.response) ? payload.response : payload;
  const body = isRecord(response.body) ? response.body : undefined;
  const data = isRecord(body) ? body.data : undefined;
  return Array.isArray(data) ? data.filter(isRecord) : [];
};

const stringValue = (record: UnknownRecord, key: string): string =>
  typeof record[key] === 'string' ? cleanText(record[key] as string) : '';

export const parseRoosterResponse = (payload: unknown): ScrapedJob[] =>
  readRecords(payload).flatMap((record) => {
    const id = typeof record.id === 'number' || typeof record.id === 'string' ? String(record.id) : '';
    const title = stringValue(record, 'title');
    const company = stringValue(record, 'subsidiary_company_name') || stringValue(record, 'company_name');
    const descriptionHtml = typeof record.description === 'string' ? record.description : '';
    if (!id || !title || !company || !descriptionHtml) return [];

    return [{
      sourceSite: 'rooster.jobs' as const,
      title,
      company,
      url: `${ROOSTER_BASE_URL}/jobs/${encodeURIComponent(id)}`,
      rawDescription: htmlToText(descriptionHtml),
    }];
  });

export const createRoosterScraper = (http: PortalHttpClient = portalHttpClient): ScraperSource =>
  Object.assign(
    async (targetRoles: string[]): Promise<ScrapedJob[]> => {
      const jobs: ScrapedJob[] = [];
      for (const role of selectedRoles(targetRoles)) {
        const payload = await http.postJson(ROOSTER_API_URL, {
          query: [role],
          limit: 20,
          page: 1,
          filters: {},
        });
        jobs.push(...parseRoosterResponse(payload));
      }
      return uniqueLimitedJobs(jobs.filter((job) => isTitleRelevant(job.title, targetRoles)));
    },
    { sourceSite: 'rooster.jobs' as const },
  );
