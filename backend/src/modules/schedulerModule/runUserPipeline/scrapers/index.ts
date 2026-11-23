import type { ScraperSource } from '../types';
import { createItProScraper } from './itPro';
import { createJobSeekerScraper } from './jobSeeker';
import { createRoosterScraper } from './rooster';
import { createTopJobsScraper } from './topJobs';

/**
 * Default independent inventories. Careers.lk aliases TopJobs and is omitted
 * to avoid duplicate requests and records; createCareersScraper remains
 * available when that branding is explicitly required.
 */
export const createDefaultScraperSources = (): ScraperSource[] => [
  createTopJobsScraper(),
  createRoosterScraper(),
  createItProScraper(),
  createJobSeekerScraper(),
];

export { createCareersScraper } from './careers';
export { createItProScraper } from './itPro';
export { createJobSeekerScraper } from './jobSeeker';
export { createRoosterScraper } from './rooster';
export { createTopJobsScraper } from './topJobs';
