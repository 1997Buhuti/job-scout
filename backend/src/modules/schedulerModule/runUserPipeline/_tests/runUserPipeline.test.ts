import { runUserPipeline } from '@modules/schedulerModule/runUserPipeline/runUserPipeline';
import type { JobPosting, ScrapedJob, ScraperSource } from '@modules/schedulerModule/runUserPipeline/types';

const jobA: ScrapedJob = {
  sourceSite: 'topjobs.lk',
  title: 'Software Engineer',
  company: 'Acme',
  url: 'https://www.topjobs.lk/jobs/a',
  rawDescription: 'desc a',
};

const jobB: ScrapedJob = {
  sourceSite: 'topjobs.lk',
  title: 'Backend Engineer',
  company: 'Beta',
  url: 'https://www.topjobs.lk/jobs/b',
  rawDescription: 'desc b',
};

// Same URL as jobA, produced by a different source - must dedupe.
const jobADuplicate: ScrapedJob = {
  ...jobA,
  title: 'Software Engineer (duplicate listing)',
};

describe('runUserPipeline', () => {
  it('upserts once per unique URL, dropping cross-source duplicates', async () => {
    const sourceOne: ScraperSource = jest.fn().mockResolvedValue([jobA, jobB]);
    const sourceTwo: ScraperSource = jest.fn().mockResolvedValue([jobADuplicate]);

    const upsert = jest.fn(
      async (job: ScrapedJob): Promise<JobPosting> => ({
        ...job,
        jobId: `id-${job.url}`,
        scrapedAt: '2024-01-01T00:00:00.000Z',
      }),
    );

    const result = await runUserPipeline(['Software Engineer'], { sources: [sourceOne, sourceTwo], upsert });

    expect(sourceOne).toHaveBeenCalledWith(['Software Engineer']);
    expect(sourceTwo).toHaveBeenCalledWith(['Software Engineer']);

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith(jobA);
    expect(upsert).toHaveBeenCalledWith(jobB);
    expect(upsert).not.toHaveBeenCalledWith(jobADuplicate);

    expect(result.scraped).toBe(2);
    expect(result.upserted).toHaveLength(2);
    expect(result.upserted.map((job) => job.url).sort()).toEqual([jobA.url, jobB.url].sort());
  });

  it('returns an empty result when no sources yield jobs', async () => {
    const source: ScraperSource = jest.fn().mockResolvedValue([]);
    const upsert = jest.fn();

    const result = await runUserPipeline(['Nonexistent Role'], { sources: [source], upsert });

    expect(result).toEqual({ scraped: 0, upserted: [] });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('continues when one portal fails and another returns jobs', async () => {
    const failedSource: ScraperSource = Object.assign(
      jest.fn().mockRejectedValue(new Error('portal unavailable')),
      { sourceSite: 'rooster.jobs' as const },
    );
    const workingSource: ScraperSource = Object.assign(
      jest.fn().mockResolvedValue([jobA]),
      { sourceSite: 'topjobs.lk' as const },
    );
    const upsert = jest.fn(async (job: ScrapedJob): Promise<JobPosting> => ({
      ...job,
      jobId: 'id-a',
      scrapedAt: '2024-01-01T00:00:00.000Z',
    }));

    const result = await runUserPipeline(['Software Engineer'], {
      sources: [failedSource, workingSource],
      upsert,
    });

    expect(result.scraped).toBe(1);
    expect(upsert).toHaveBeenCalledWith(jobA);
  });

  it('fails the run when every configured portal fails', async () => {
    const source: ScraperSource = jest.fn().mockRejectedValue(new Error('offline'));

    await expect(runUserPipeline(['Software Engineer'], { sources: [source] })).rejects.toThrow(
      'All configured job portal scrapers failed',
    );
  });
});
