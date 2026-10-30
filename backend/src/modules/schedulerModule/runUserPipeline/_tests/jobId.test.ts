import { jobIdFromUrl } from '@modules/schedulerModule/runUserPipeline/jobId';

describe('jobIdFromUrl', () => {
  it('returns the same jobId for the same URL', () => {
    const url = 'https://www.topjobs.lk/jobs/software-engineer-123';
    expect(jobIdFromUrl(url)).toBe(jobIdFromUrl(url));
  });

  it('returns different jobIds for different URLs', () => {
    const a = jobIdFromUrl('https://www.topjobs.lk/jobs/software-engineer-123');
    const b = jobIdFromUrl('https://www.topjobs.lk/jobs/software-engineer-456');
    expect(a).not.toBe(b);
  });

  it('returns a 32-char lowercase hex string (MD5)', () => {
    const jobId = jobIdFromUrl('https://www.topjobs.lk/jobs/software-engineer-123');
    expect(jobId).toMatch(/^[a-f0-9]{32}$/);
  });
});
