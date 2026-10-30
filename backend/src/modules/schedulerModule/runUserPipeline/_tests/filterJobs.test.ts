import {
  matchesExcludedKeyword,
  matchesWorkMode,
  filterJobsForUser,
} from '@modules/schedulerModule/runUserPipeline/filterJobs';
import type { FilterableJob } from '@modules/schedulerModule/runUserPipeline/types';

const buildJob = (overrides: Partial<FilterableJob> = {}): FilterableJob => ({
  title: 'Software Engineer',
  description: 'Build and ship features using JavaScript and TypeScript.',
  workMode: 'remote',
  ...overrides,
});

describe('matchesExcludedKeyword', () => {
  it('is case-insensitive', () => {
    const job = buildJob({ title: 'Senior INTERN Role' });
    expect(matchesExcludedKeyword(job, ['intern'])).toBe(true);
  });

  it('matches whole words only, not substrings (java should not match javascript)', () => {
    const job = buildJob({
      title: 'Software Engineer',
      description: 'Experience with JavaScript required.',
    });
    expect(matchesExcludedKeyword(job, ['java'])).toBe(false);
  });

  it('matches a whole word keyword present in the description', () => {
    const job = buildJob({
      title: 'Software Engineer',
      description: 'This role requires strong Java skills.',
    });
    expect(matchesExcludedKeyword(job, ['java'])).toBe(true);
  });

  it('returns false when no keywords are provided', () => {
    const job = buildJob();
    expect(matchesExcludedKeyword(job, [])).toBe(false);
  });

  it('returns false when no keyword matches', () => {
    const job = buildJob();
    expect(matchesExcludedKeyword(job, ['sales', 'marketing'])).toBe(false);
  });
});

describe('matchesWorkMode', () => {
  it('drops a job whose known work mode is not selected', () => {
    const job = buildJob({ workMode: 'onsite' });
    expect(matchesWorkMode(job, ['remote', 'hybrid'])).toBe(true);
  });

  it('keeps a job whose known work mode is selected', () => {
    const job = buildJob({ workMode: 'remote' });
    expect(matchesWorkMode(job, ['remote', 'hybrid'])).toBe(false);
  });

  it('keeps a job with an unknown work mode (AC-9)', () => {
    const job = buildJob({ workMode: undefined });
    expect(matchesWorkMode(job, ['remote'])).toBe(false);
  });

  it('keeps a job with a missing work mode field (AC-9)', () => {
    const { workMode: _workMode, ...rest } = buildJob();
    const job = rest as FilterableJob;
    expect(matchesWorkMode(job, ['remote'])).toBe(false);
  });
});

describe('filterJobsForUser', () => {
  it('drops jobs matching excluded keywords or an unselected known work mode', () => {
    const jobs: FilterableJob[] = [
      buildJob({ title: 'Software Engineer', workMode: 'remote' }),
      buildJob({ title: 'Marketing Intern', workMode: 'remote' }),
      buildJob({ title: 'Office Administrator', workMode: 'onsite' }),
    ];

    const result = filterJobsForUser(jobs, {
      excludedKeywords: ['intern'],
      workModes: ['remote', 'hybrid'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Software Engineer');
  });

  it('salary has no effect on the filter outcome, even when present on job objects (AC-11)', () => {
    const jobWithoutSalary = buildJob({ title: 'Software Engineer' }) as FilterableJob & {
      salary?: number;
    };
    const jobWithLowSalary = {
      ...buildJob({ title: 'Software Engineer' }),
      salary: 10_000,
    };
    const jobWithHighSalary = {
      ...buildJob({ title: 'Software Engineer' }),
      salary: 10_000_000,
    };

    const prefs = { excludedKeywords: [], workModes: ['remote' as const] };

    const resultNoSalary = filterJobsForUser([jobWithoutSalary], prefs);
    const resultLowSalary = filterJobsForUser([jobWithLowSalary], prefs);
    const resultHighSalary = filterJobsForUser([jobWithHighSalary], prefs);

    expect(resultNoSalary).toHaveLength(1);
    expect(resultLowSalary).toHaveLength(1);
    expect(resultHighSalary).toHaveLength(1);
  });
});
