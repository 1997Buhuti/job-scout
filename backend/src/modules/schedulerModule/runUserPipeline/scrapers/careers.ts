import type { ScraperSource } from '../types';
import type { PortalHttpClient } from './httpClient';
import { portalHttpClient } from './httpClient';
import { createTopJobsScraper } from './topJobs';

/**
 * careers.lk is a DNS alias of topjobs.lk and presents the same inventory
 * through a hostname with an invalid TLS certificate. This adapter uses the
 * valid TopJobs origin and canonical URLs. Do not run it beside TopJobs or the
 * same inventory will be requested twice.
 */
export const createCareersScraper = (http: PortalHttpClient = portalHttpClient): ScraperSource =>
  createTopJobsScraper(http, 'careers.lk');
