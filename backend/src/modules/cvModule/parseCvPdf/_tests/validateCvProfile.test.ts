import { CV_PROFILE_LIMITS, sanitizeCvProfile } from '@modules/cvModule/parseCvPdf/validateCvProfile';

const KEY = 'cvs/user-1/1.pdf';
const NOW = new Date('2026-10-23T10:00:00.000Z');

const sanitize = (input: unknown) => sanitizeCvProfile(input, KEY, NOW);

describe('sanitizeCvProfile', () => {
  it('keeps a valid profile and sets server-owned fields', () => {
    const profile = sanitize({
      fullName: 'Jane Doe',
      summary: 'Engineer.',
      skills: ['TypeScript', 'AWS'],
      experience: [{ title: 'Dev', company: 'Acme', period: '2020 - 2023', summary: 'Did things' }],
      education: [{ institution: 'MIT', degree: 'BSc', field: 'CS', year: '2018' }],
      extractedAt: 'forged',
      sourceCvS3Key: 'cvs/other/forged.pdf',
    });

    expect(profile).toEqual({
      fullName: 'Jane Doe',
      summary: 'Engineer.',
      skills: ['TypeScript', 'AWS'],
      experience: [{ title: 'Dev', company: 'Acme', period: '2020 - 2023', summary: 'Did things' }],
      education: [{ institution: 'MIT', degree: 'BSc', field: 'CS', year: '2018' }],
      extractedAt: NOW.toISOString(),
      sourceCvS3Key: KEY,
    });
  });

  it('drops unknown fields at every level', () => {
    const profile = sanitize({
      skills: ['Go'],
      isAdmin: true,
      experience: [{ title: 'Dev', company: 'Acme', salary: 1 }],
      education: [{ institution: 'MIT', gpa: 4 }],
    });

    expect(profile).not.toHaveProperty('isAdmin');
    expect(profile.experience[0]).toEqual({ title: 'Dev', company: 'Acme' });
    expect(profile.education[0]).toEqual({ institution: 'MIT' });
  });

  it('treats missing lists as empty and omits missing optionals', () => {
    const profile = sanitize({});

    expect(profile.skills).toEqual([]);
    expect(profile.experience).toEqual([]);
    expect(profile.education).toEqual([]);
    expect(profile).not.toHaveProperty('fullName');
    expect(profile).not.toHaveProperty('summary');
  });

  it.each([null, undefined, 'text', 42, [], ['a']])('rejects a non-object cvProfile (%p)', (input) => {
    expect(() => sanitize(input)).toThrow('cvProfile must be an object');
  });

  it.each(['skills', 'experience', 'education'])('rejects a non-array %s', (field) => {
    expect(() => sanitize({ [field]: 'nope' })).toThrow(`cvProfile.${field} must be an array`);
  });

  it('trims, collapses whitespace, strips control characters and drops empties', () => {
    const profile = sanitize({
      fullName: '  Jane\u0000   Doe\n',
      skills: ['  React  ', '', '   ', 'Type\tScript', 42, null],
    });

    expect(profile.fullName).toBe('Jane Doe');
    expect(profile.skills).toEqual(['React', 'Type Script']);
  });

  it('dedupes skills case-insensitively, keeping the first spelling', () => {
    expect(sanitize({ skills: ['JavaScript', 'javascript', 'JAVASCRIPT', 'React'] }).skills).toEqual(['JavaScript', 'React']);
  });

  it('caps skills at 40 and drops (not truncates) skills over 48 characters', () => {
    const tooLong = 'A'.repeat(CV_PROFILE_LIMITS.SKILL_LENGTH + 1);
    const exactly48 = 'B'.repeat(CV_PROFILE_LIMITS.SKILL_LENGTH);
    const many = Array.from({ length: 60 }, (_, i) => `Skill${i}`);

    const { skills } = sanitize({ skills: [tooLong, exactly48, ...many] });

    expect(skills).not.toContain(tooLong);
    expect(skills).toContain(exactly48);
    expect(skills).toHaveLength(CV_PROFILE_LIMITS.SKILLS);
  });

  it('drops experience without title/company and caps entries at 15', () => {
    const valid = Array.from({ length: 20 }, (_, i) => ({ title: `Dev ${i}`, company: `Co ${i}` }));

    const { experience } = sanitize({
      experience: [{ title: 'No company' }, { company: 'No title' }, 'junk', null, ...valid],
    });

    expect(experience).toHaveLength(CV_PROFILE_LIMITS.EXPERIENCE);
    expect(experience[0]).toEqual({ title: 'Dev 0', company: 'Co 0' });
  });

  it('drops education without an institution and caps entries at 10', () => {
    const valid = Array.from({ length: 15 }, (_, i) => ({ institution: `Uni ${i}` }));

    const { education } = sanitize({ education: [{ degree: 'BSc' }, ...valid] });

    expect(education).toHaveLength(CV_PROFILE_LIMITS.EDUCATION);
  });

  it('caps text fields at their limits', () => {
    const profile = sanitize({
      fullName: 'N'.repeat(300),
      summary: 'S'.repeat(900),
      experience: [{ title: 'T'.repeat(400), company: 'C'.repeat(400), period: 'P'.repeat(300), summary: 'X'.repeat(900) }],
      education: [{ institution: 'I'.repeat(400), degree: 'D'.repeat(300), field: 'F'.repeat(300), year: 'Y'.repeat(100) }],
    });

    expect(profile.fullName).toHaveLength(CV_PROFILE_LIMITS.FULL_NAME_LENGTH);
    expect(profile.summary).toHaveLength(CV_PROFILE_LIMITS.SUMMARY_LENGTH);
    expect(profile.experience[0].title).toHaveLength(CV_PROFILE_LIMITS.TITLE_COMPANY_LENGTH);
    expect(profile.experience[0].period).toHaveLength(CV_PROFILE_LIMITS.PERIOD_LENGTH);
    expect(profile.experience[0].summary).toHaveLength(CV_PROFILE_LIMITS.SUMMARY_LENGTH);
    expect(profile.education[0].institution).toHaveLength(CV_PROFILE_LIMITS.TITLE_COMPANY_LENGTH);
    expect(profile.education[0].degree).toHaveLength(CV_PROFILE_LIMITS.DEGREE_FIELD_LENGTH);
    expect(profile.education[0].year).toHaveLength(CV_PROFILE_LIMITS.YEAR_LENGTH);
  });

  it('ignores non-string values in string fields', () => {
    const profile = sanitize({ fullName: 123, summary: { a: 1 }, experience: [{ title: 5, company: 'Acme' }] });

    expect(profile).not.toHaveProperty('fullName');
    expect(profile).not.toHaveProperty('summary');
    expect(profile.experience).toEqual([]);
  });
});
