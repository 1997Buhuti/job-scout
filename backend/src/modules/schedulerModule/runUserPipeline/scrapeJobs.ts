/**
 * Backward-compatible scraper exports. Portal implementations live in
 * `scrapers/` so site-specific extraction rules stay isolated.
 */
export { portalHttpClient as axiosPortalHttpClient } from './scrapers/httpClient';
export type { PortalHttpClient } from './scrapers/httpClient';
export {
  createTopJobsScraper as scrapeTopJobs,
  parseTopJobsListings,
  TOPJOBS_BASE_URL,
} from './scrapers/topJobs';
