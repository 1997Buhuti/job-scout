import {
  parseItProListings,
} from '@modules/schedulerModule/runUserPipeline/scrapers/itPro';
import {
  parseJobSeekerPosts,
} from '@modules/schedulerModule/runUserPipeline/scrapers/jobSeeker';
import {
  parseRoosterResponse,
} from '@modules/schedulerModule/runUserPipeline/scrapers/rooster';
import {
  createTopJobsScraper,
  parseTopJobsListings,
} from '@modules/schedulerModule/runUserPipeline/scrapers/topJobs';
import type { PortalHttpClient } from '@modules/schedulerModule/runUserPipeline/scrapers/httpClient';
import { isTitleRelevant } from '@modules/schedulerModule/runUserPipeline/scrapers/normalize';

const TOPJOBS_HTML = `
<table id="table"><tbody>
  <tr id="tr0" onclick="createAlert('0','0000000201','0001574405','0000000240','ignored')">
    <td>1</td><td>1574405</td>
    <td>
      <span id="hdnJC0" hidden>0001574405</span>
      <span id="hdnEC0" hidden>0000000240</span>
      <span id="hdnAC0" hidden>0000000201</span>
      <h2><span>Senior Software Engineer (1)</span></h2>
      <h1>Acme Lanka</h1>
    </td>
    <td>Build cloud services</td><td>Nov 20</td><td>Nov 30</td><td>Colombo</td>
  </tr>
</tbody></table>`;

const mockHttp = (overrides: Partial<PortalHttpClient> = {}): PortalHttpClient => ({
  getText: jest.fn().mockResolvedValue(''),
  getJson: jest.fn().mockResolvedValue([]),
  postForm: jest.fn().mockResolvedValue(''),
  postJson: jest.fn().mockResolvedValue({}),
  ...overrides,
});

describe('portal scrapers', () => {
  it('drops broad generic-title matches before they consume the source cap', () => {
    expect(isTitleRelevant('Assistant Design Engineer', ['Software Engineer'])).toBe(false);
    expect(isTitleRelevant('Senior Software Engineer', ['Software Engineer'])).toBe(true);
    expect(isTitleRelevant('Backend Developer', ['Backend Developer'])).toBe(true);
  });

  it('parses verified TopJobs table rows and builds a stable detail URL', () => {
    expect(parseTopJobsListings(TOPJOBS_HTML)).toEqual([
      expect.objectContaining({
        sourceSite: 'topjobs.lk',
        title: 'Senior Software Engineer',
        company: 'Acme Lanka',
        url: 'https://www.topjobs.lk/employer/JobAdvertismentServlet?ac=0000000201&jc=0001574405&ec=0000000240',
        rawDescription: expect.stringContaining('Build cloud services'),
      }),
    ]);
  });

  it('queries TopJobs once per role and deduplicates repeated rows', async () => {
    const http = mockHttp({ getText: jest.fn().mockResolvedValue(TOPJOBS_HTML) });
    const jobs = await createTopJobsScraper(http)(['Software Engineer', 'Software Engineer']);

    expect(http.getText).toHaveBeenCalledTimes(1);
    expect(http.getText).toHaveBeenCalledWith(expect.stringContaining('txtKeyWord=Software+Engineer'));
    expect(jobs).toHaveLength(1);
  });

  it('parses Rooster API records with full HTML descriptions', () => {
    const jobs = parseRoosterResponse({
      body: {
        data: [{
          id: 42,
          title: 'Backend Engineer',
          company_name: 'Acme',
          subsidiary_company_name: '',
          description: '<p>Build <strong>APIs</strong>.</p>',
        }],
      },
    });

    expect(jobs).toEqual([{
      sourceSite: 'rooster.jobs',
      title: 'Backend Engineer',
      company: 'Acme',
      url: 'https://rooster.jobs/jobs/42',
      rawDescription: 'Build APIs.',
    }]);
  });

  it('parses verified ITPro listing cards', () => {
    const html = `
      <div id="job-listings"><ul class="jc-list">
        <article id="15276" class="job-card">
          <a class="jcl" href="/job/15276/backend-engineer/"><span class="jc-title">Backend Engineer</span></a>
          <span class="jc-company">Acme</span><span class="la">Colombo</span>
        </article>
      </ul></div>`;

    expect(parseItProListings(html)).toEqual([
      expect.objectContaining({
        sourceSite: 'itpro.lk',
        title: 'Backend Engineer',
        company: 'Acme',
        url: 'https://itpro.lk/job/15276/backend-engineer/',
      }),
    ]);
  });

  it('parses JobSeeker WordPress posts and falls back when company is absent', () => {
    const jobs = parseJobSeekerPosts([{
      id: 28517,
      link: 'https://jobseeker.lk/backend-developer/?utm_source=test',
      title: { rendered: 'Backend Developer' },
      content: { rendered: '<p>Company: Acme Lanka.</p><p>Build APIs.</p>' },
    }]);

    expect(jobs).toEqual([{
      sourceSite: 'jobseeker.lk',
      title: 'Backend Developer',
      company: 'Acme Lanka',
      url: 'https://jobseeker.lk/backend-developer/',
      rawDescription: 'Company: Acme Lanka.Build APIs.',
    }]);
  });
});
