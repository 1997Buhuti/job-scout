import { scrapeTopJobs } from '@modules/schedulerModule/runUserPipeline/scrapeJobs';

const FIXTURE_HTML = `
<html>
  <body>
    <ul>
      <li class="job-listing-item">
        <a class="job-link" href="https://www.topjobs.lk/jobs/software-engineer-123">
          <span class="job-title">Software Engineer</span>
        </a>
        <span class="job-company">Acme Lanka (Pvt) Ltd</span>
        <p>Build and ship product features.</p>
      </li>
      <li class="job-listing-item">
        <a class="job-link" href="https://www.topjobs.lk/jobs/senior-software-engineer-456">
          <span class="job-title">Senior Software Engineer</span>
        </a>
        <span class="job-company">Beta Systems</span>
        <p>Lead a small backend team.</p>
      </li>
      <li class="job-listing-item">
        <!-- Missing href: should be skipped -->
        <span class="job-title">Incomplete Listing</span>
        <span class="job-company">Nobody</span>
      </li>
    </ul>
  </body>
</html>
`;

describe('scrapeTopJobs', () => {
  it('extracts title/company/url/sourceSite from fixture HTML without any network call', async () => {
    const fetchHtml = jest.fn().mockResolvedValue(FIXTURE_HTML);

    const jobs = await scrapeTopJobs(fetchHtml)(['Software Engineer']);

    expect(fetchHtml).toHaveBeenCalledTimes(1);
    expect(fetchHtml).toHaveBeenCalledWith(expect.stringContaining('Software%20Engineer'));

    expect(jobs).toEqual([
      {
        sourceSite: 'topjobs.lk',
        title: 'Software Engineer',
        company: 'Acme Lanka (Pvt) Ltd',
        url: 'https://www.topjobs.lk/jobs/software-engineer-123',
        rawDescription: expect.stringContaining('Build and ship product features.'),
      },
      {
        sourceSite: 'topjobs.lk',
        title: 'Senior Software Engineer',
        company: 'Beta Systems',
        url: 'https://www.topjobs.lk/jobs/senior-software-engineer-456',
        rawDescription: expect.stringContaining('Lead a small backend team.'),
      },
    ]);
  });

  it('dedupes by URL across multiple target roles within one call', async () => {
    const fetchHtml = jest.fn().mockResolvedValue(FIXTURE_HTML);

    const jobs = await scrapeTopJobs(fetchHtml)(['Software Engineer', 'Senior Software Engineer']);

    expect(fetchHtml).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((job) => job.url)).size).toBe(2);
  });
});
