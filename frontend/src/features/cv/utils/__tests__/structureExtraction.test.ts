import {
  MAX_CAPS,
  extractEducation,
  extractExperience,
  extractNameAndSummary,
  extractSkills,
  isEmptyCvProfile,
  normalizeCvText,
  structureCvProfile,
} from '../structureExtraction';

const SAMPLE_CV = `
JOHN SMITH
john.smith@example.com | +94 77 123 4567 | Colombo, Sri Lanka

Summary
Full-stack engineer with 6 years of experience building web platforms on AWS.

Skills
Languages: JavaScript, TypeScript, Python
Frameworks: React, Node.js, Next.js
Cloud: AWS (Lambda, S3), Docker, Terraform
Soft skills: Teamwork, Mentoring

Experience
Senior Software Engineer | Acme Corp
Jan 2021 - Present
• Led a team of 5 building a serverless API on AWS Lambda
• Cut p95 latency by 40% with DynamoDB single-table design

Software Engineer
Beta Solutions
06/2018 - 12/2020
- Built React dashboards with Redux
- Wrote Jest and Cypress tests

Education
Bachelor of Science in Computer Science
University of Moratuwa
2014 - 2018

Languages
English, Sinhala
`;

describe('normalizeCvText', () => {
  it('unifies newlines, dashes, bullets and whitespace', () => {
    const raw = 'A\u00a0B\r\n\u2022 item \u2013 x\t\ty\r\n\r\n\r\n\r\nend\u200b';
    expect(normalizeCvText(raw)).toBe('A B\n• item - x y\n\nend');
  });

  it('is idempotent', () => {
    const once = normalizeCvText(SAMPLE_CV);
    expect(normalizeCvText(once)).toBe(once);
  });
});

describe('extractSkills', () => {
  it('normalizes dictionary skills and keeps unknown Skills-section tokens as typed', () => {
    const skills = extractSkills(`
      Skills:
      JS, ts, ReactJS, Node.js, AWS Lambda, Rapid Prototyping
    `);

    expect(skills).toEqual(
      expect.arrayContaining(['JavaScript', 'TypeScript', 'React', 'Node.js', 'Lambda', 'Rapid Prototyping']),
    );
  });

  it('splits "Category: a, b" lines and parenthesised lists', () => {
    const skills = extractSkills('Skills\nCloud: AWS (EC2, S3), Docker\n• Kubernetes | Terraform');

    expect(skills).toEqual(expect.arrayContaining(['AWS', 'EC2', 'S3', 'Docker', 'Kubernetes', 'Terraform']));
    expect(skills).not.toContain('Cloud');
  });

  it('keeps tokens from "Languages:"-style category lines inside the Skills section', () => {
    // "Zig" and "Rapid Prototyping" are not in the dictionary, so they can only
    // come from the Skills section itself.
    const skills = extractSkills('Skills\nLanguages: JavaScript, Zig\nTools: Figma, Rapid Prototyping\n\nExperience\nDeveloper at Acme');

    expect(skills).toEqual(expect.arrayContaining(['JavaScript', 'Zig', 'Figma', 'Rapid Prototyping']));
  });

  it('puts Skills-section order first, then other dictionary hits in text order', () => {
    const skills = extractSkills('Summary\nBuilt things on AWS.\n\nSkills\nPython, React');

    expect(skills).toEqual(['Python', 'React', 'AWS']);
  });

  it('finds dictionary skills anywhere in the text', () => {
    const skills = extractSkills(`
      Experience
      Tech Lead | Acme
      2020 - 2023
      Built Node.js services on AWS with PostgreSQL and Docker.
    `);

    expect(skills).toEqual(expect.arrayContaining(['Node.js', 'AWS', 'PostgreSQL', 'Docker']));
  });

  it('does not match short or ambiguous terms inside ordinary words', () => {
    const skills = extractSkills(
      'I go to great lengths to deliver good results. We use JavaScript for the web, and I express ideas clearly.',
    );

    expect(skills).toContain('JavaScript');
    expect(skills).not.toContain('Go');
    expect(skills).not.toContain('Java');
    expect(skills).not.toContain('C');
    expect(skills).not.toContain('R');
    expect(skills).not.toContain('Express');
  });

  it('does not treat the ".js" in Node.js or React.js as JavaScript', () => {
    const skills = extractSkills('Worked with Node.js and React.js daily.');

    expect(skills).toEqual(expect.arrayContaining(['Node.js', 'React']));
    expect(skills).not.toContain('JavaScript');
  });

  it('accepts ambiguous terms only when listed in the Skills section', () => {
    const skills = extractSkills('Skills\nGo, R, C, SQL');

    expect(skills).toEqual(expect.arrayContaining(['Go', 'R', 'C', 'SQL']));
  });

  it('handles special-character skills', () => {
    const skills = extractSkills('Skills: C++, C#, .NET, CI/CD');

    expect(skills).toEqual(expect.arrayContaining(['C++', 'C#', '.NET', 'CI/CD']));
  });

  it('deduplicates case-insensitively and across variations', () => {
    const skills = extractSkills('Skills: JavaScript, javascript, JS, React, ReactJS\nI love JavaScript.');

    expect(skills.filter((s) => s === 'JavaScript')).toHaveLength(1);
    expect(skills.filter((s) => s === 'React')).toHaveLength(1);
  });

  it('drops empty tokens, bare hyphens, stopwords and sentences', () => {
    const skills = extractSkills(
      'Skills\n• -\n• \n• and\n• etc.\n• I am a very good communicator who works hard\n• TypeScript',
    );

    expect(skills).toEqual(['TypeScript']);
  });

  it('caps the number of skills at 40 and their length at 48 chars', () => {
    const many = Array.from({ length: 60 }, (_, i) => `Skill${i}`).join(', ');
    const tooLong = 'A'.repeat(60);

    const skills = extractSkills(`Skills: ${tooLong}, ${many}`);

    expect(skills.length).toBeLessThanOrEqual(MAX_CAPS.SKILLS);
    skills.forEach((skill) => expect(skill.length).toBeLessThanOrEqual(MAX_CAPS.SKILL_LENGTH));
    expect(skills).not.toContain(tooLong);
  });
});

describe('extractExperience', () => {
  it('parses "Title | Company" with the date on the next line and bullet summary', () => {
    const [first] = extractExperience(SAMPLE_CV);

    expect(first.title).toBe('Senior Software Engineer');
    expect(first.company).toBe('Acme Corp');
    expect(first.period).toBe('Jan 2021 - Present');
    expect(first.summary).toContain('Led a team of 5');
    expect(first.summary).toContain('DynamoDB');
  });

  it('parses title and company on separate lines with a numeric date range', () => {
    const entries = extractExperience(SAMPLE_CV);

    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({
      title: 'Software Engineer',
      company: 'Beta Solutions',
      period: '06/2018 - 12/2020',
    });
    expect(entries[1].summary).toContain('Built React dashboards');
  });

  it('parses "Title at Company" with the date range on the same line', () => {
    const [entry] = extractExperience(`
      Work Experience
      Backend Developer at Cloud Nine Ltd  2019 - 2021
      - Built REST APIs
    `);

    expect(entry).toMatchObject({ title: 'Backend Developer', company: 'Cloud Nine Ltd', period: '2019 - 2021' });
  });

  it('supports date-first layouts (date line, then title and company)', () => {
    const [entry] = extractExperience(`
      Experience
      March 2022 - Present
      Data Analyst
      Insight Labs
      - Built dashboards in Tableau
    `);

    expect(entry).toMatchObject({ title: 'Data Analyst', company: 'Insight Labs', period: 'March 2022 - Present' });
    expect(entry.summary).toContain('Tableau');
  });

  it.each([
    ['01/2020 - 12/2022', '01/2020 - 12/2022'],
    ['January 2021 - Present', 'January 2021 - Present'],
    ['2018 - 2023', '2018 - 2023'],
    ['2018 to current', '2018 - Present'],
    ['Sept 2019 – Aug 2020', 'Sept 2019 - Aug 2020'],
  ])('recognises the date range "%s"', (range, expected) => {
    const [entry] = extractExperience(`Experience\nDeveloper at Acme\n${range}\n- work`);

    expect(entry.period).toBe(expected);
  });

  it('omits entries when the company cannot be determined (no guessing)', () => {
    expect(extractExperience('Experience\nSoftware Engineer\n2020 - 2023\n- Worked on projects')).toEqual([]);
  });

  it('returns an empty array when there is no Experience section', () => {
    expect(extractExperience('Skills\nJavaScript')).toEqual([]);
  });

  it('caps the number of entries at 15', () => {
    const entries = Array.from(
      { length: 20 },
      (_, i) => `Developer at Company ${i}\n2020 - 2023\n- Work ${i}\n`,
    ).join('\n');

    expect(extractExperience(`Experience\n${entries}`).length).toBeLessThanOrEqual(MAX_CAPS.EXPERIENCE);
  });

  it('caps the entry summary at 500 characters', () => {
    const [entry] = extractExperience(`Experience\nDeveloper at Acme\n2020 - 2023\n- ${'x'.repeat(900)}`);

    expect(entry.summary).toHaveLength(MAX_CAPS.EXPERIENCE_SUMMARY_LENGTH);
  });
});

describe('extractEducation', () => {
  it('splits degree, field, institution and year', () => {
    const [entry] = extractEducation(SAMPLE_CV);

    expect(entry).toEqual({
      institution: 'University of Moratuwa',
      degree: 'Bachelor of Science',
      field: 'Computer Science',
      year: '2014 - 2018',
    });
  });

  it('handles degree abbreviations and everything on one line', () => {
    const [entry] = extractEducation('Education\nM.Sc. in Data Science, Tech Institute, 2021');

    expect(entry).toEqual({
      institution: 'Tech Institute',
      degree: 'M.Sc.',
      field: 'Data Science',
      year: '2021',
    });
  });

  it('handles institution-first layouts and multiple entries', () => {
    const entries = extractEducation(`
      Education
      Tech University
      Master of Science in Software Engineering
      2020 - 2022

      State College
      Bachelor's Degree in Information Technology
      2016 - 2020
    `);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ institution: 'Tech University', degree: 'Master of Science', year: '2020 - 2022' });
    expect(entries[1]).toMatchObject({ institution: 'State College', field: 'Information Technology' });
  });

  it('does not require a graduation year', () => {
    const [entry] = extractEducation('Education\nBachelor of Science in Engineering\nTech University');

    expect(entry.institution).toBe('Tech University');
    expect(entry.year).toBeUndefined();
  });

  it('ignores GPA/grade lines as institutions', () => {
    const entries = extractEducation('Education\nBSc in IT\nGPA: 3.8\nUniversity of Colombo\n2019');

    expect(entries).toHaveLength(1);
    expect(entries[0].institution).toBe('University of Colombo');
  });

  it('returns an empty array without an Education section', () => {
    expect(extractEducation('Skills\nJavaScript')).toEqual([]);
  });

  it('caps the number of entries at 10', () => {
    const entries = Array.from(
      { length: 15 },
      (_, i) => `Bachelor of Science in Field ${i}\nUniversity ${i}\n200${i % 10} - 201${i % 10}\n`,
    ).join('\n');

    expect(extractEducation(`Education\n${entries}`).length).toBeLessThanOrEqual(MAX_CAPS.EDUCATION);
  });
});

describe('extractNameAndSummary', () => {
  it('takes the name from the top of the document (ALL CAPS is title-cased)', () => {
    expect(extractNameAndSummary(SAMPLE_CV).fullName).toBe('John Smith');
  });

  it('skips title/contact lines and "Curriculum Vitae" headers', () => {
    const { fullName } = extractNameAndSummary('Curriculum Vitae\nSoftware Engineer\nMaria Garcia-Lopez\nmaria@example.com');

    expect(fullName).toBe('Maria Garcia-Lopez');
  });

  it('supports a "Name:" label in a contact block', () => {
    const { fullName } = extractNameAndSummary('Contact\nName: Jane Doe\nEmail: jane.doe@example.com');

    expect(fullName).toBe('Jane Doe');
  });

  it('reads the summary from the Summary section only', () => {
    const { summary } = extractNameAndSummary(SAMPLE_CV);

    expect(summary).toBe('Full-stack engineer with 6 years of experience building web platforms on AWS.');
  });

  it('does not invent a summary or name', () => {
    const result = extractNameAndSummary('Experience\nDeveloper at Acme\n2020 - 2023');

    expect(result.fullName).toBeUndefined();
    expect(result.summary).toBeUndefined();
  });

  it('caps the summary at 500 characters', () => {
    const { summary } = extractNameAndSummary(`Summary\n${'A'.repeat(600)}`);

    expect(summary).toHaveLength(MAX_CAPS.SUMMARY_LENGTH);
  });
});

describe('structureCvProfile', () => {
  it('assembles a complete profile from a realistic CV', () => {
    const profile = structureCvProfile(SAMPLE_CV, 'cvs/user-1/123.pdf');

    expect(profile.fullName).toBe('John Smith');
    expect(profile.summary).toContain('Full-stack engineer');
    expect(profile.skills).toEqual(
      expect.arrayContaining(['JavaScript', 'TypeScript', 'Python', 'React', 'Node.js', 'Next.js', 'AWS', 'Docker', 'Terraform']),
    );
    expect(profile.experience).toHaveLength(2);
    expect(profile.education).toHaveLength(1);
    expect(profile.sourceCvS3Key).toBe('cvs/user-1/123.pdf');
    expect(new Date(profile.extractedAt).toISOString()).toBe(profile.extractedAt);
    expect(isEmptyCvProfile(profile)).toBe(false);
  });

  it('is JSON-serialisable without undefined placeholders for missing optionals', () => {
    const profile = structureCvProfile('Skills\nPython', 'cvs/user-1/1.pdf');

    expect(profile).not.toHaveProperty('fullName');
    expect(profile).not.toHaveProperty('summary');
    expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
  });

  it('applies all caps to oversized input', () => {
    const skills = Array.from({ length: 60 }, (_, i) => `Skill${i}`).join(', ');
    const experience = Array.from({ length: 20 }, (_, i) => `Developer at Company ${i}\n2020 - 2023\n- Work`).join('\n');
    const education = Array.from({ length: 15 }, (_, i) => `BSc in Field ${i}\nUniversity ${i}\n2010`).join('\n');
    const text = `Jane Doe\n\nSummary\n${'A'.repeat(600)}\n\nSkills\n${skills}\n\nExperience\n${experience}\n\nEducation\n${education}`;

    const profile = structureCvProfile(text, 'cvs/u/1.pdf');

    expect(profile.skills.length).toBeLessThanOrEqual(MAX_CAPS.SKILLS);
    expect(profile.experience.length).toBeLessThanOrEqual(MAX_CAPS.EXPERIENCE);
    expect(profile.education.length).toBeLessThanOrEqual(MAX_CAPS.EDUCATION);
    expect((profile.summary ?? '').length).toBeLessThanOrEqual(MAX_CAPS.SUMMARY_LENGTH);
  });

  it('returns empty arrays (does not throw) for text it cannot understand', () => {
    const profile = structureCvProfile('lorem ipsum dolor sit amet', 'cvs/u/1.pdf');

    expect(profile.skills).toEqual([]);
    expect(profile.experience).toEqual([]);
    expect(profile.education).toEqual([]);
    expect(isEmptyCvProfile(profile)).toBe(true);
  });

  it('does not report skills for binary-looking garbage', () => {
    const garbage = 'en a\u0000$\ufffd \ufffd\ufffdvV\ufffd\ufffd\ufffd4r\ufffd\ufffdLX\ufffd\ufffd:\ufffdg\ufffdra J\ufffdENd';

    expect(structureCvProfile(garbage, 'cvs/u/1.pdf').skills).toEqual([]);
  });

  it('rejects empty text and a missing key', () => {
    expect(() => structureCvProfile('   ', 'cvs/u/1.pdf')).toThrow('CV text is empty or invalid');
    expect(() => structureCvProfile('some text', '')).toThrow('sourceCvS3Key is required');
  });
});
