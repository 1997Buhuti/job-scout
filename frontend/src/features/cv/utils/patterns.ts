/**
 * Regex patterns and section detection for CV text.
 *
 * All helpers are pure and browser/Node agnostic. Text is expected to have
 * been passed through `normalizeCvText` first (one logical line per `\n`,
 * hyphen-only dashes, `•` as the bullet character).
 */

export type SectionType =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'projects'
  | 'other';

/** Maps a normalized heading (lowercase, letters and spaces only) to a section. */
const HEADING_TO_SECTION: Record<string, SectionType> = {};

const registerHeadings = (section: SectionType, headings: string[]): void => {
  headings.forEach((heading) => {
    HEADING_TO_SECTION[heading] = section;
  });
};

registerHeadings('summary', [
  'summary',
  'professional summary',
  'career summary',
  'executive summary',
  'profile',
  'professional profile',
  'personal profile',
  'about me',
  'about',
  'objective',
  'career objective',
]);

registerHeadings('experience', [
  'experience',
  'work experience',
  'professional experience',
  'relevant experience',
  'industry experience',
  'work history',
  'employment',
  'employment history',
  'career history',
]);

registerHeadings('education', [
  'education',
  'education and training',
  'academic background',
  'academic qualifications',
  'educational qualifications',
  'academic profile',
  'academics',
  'qualifications',
]);

registerHeadings('skills', [
  'skills',
  'technical skills',
  'key skills',
  'core skills',
  'core competencies',
  'competencies',
  'technologies',
  'tech stack',
  'technical expertise',
  'technical proficiencies',
  'skills and tools',
  'skills and technologies',
  'areas of expertise',
  'expertise',
]);

registerHeadings('projects', [
  'projects',
  'personal projects',
  'academic projects',
  'key projects',
  'project experience',
]);

registerHeadings('other', [
  'certifications',
  'certifications and licenses',
  'licenses and certifications',
  'certificates',
  'courses',
  'achievements',
  'awards',
  'honors',
  'honours',
  'honors and awards',
  'references',
  'referees',
  'languages',
  'interests',
  'hobbies',
  'hobbies and interests',
  'publications',
  'volunteer',
  'volunteering',
  'volunteer experience',
  'extracurricular activities',
  'activities',
  'contact',
  'contact information',
  'personal details',
  'personal information',
  'declaration',
]);

const MAX_HEADING_LENGTH = 40;

/** Lowercase, `&` -> "and", drop everything except letters/spaces. */
const normalizeHeading = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * If `line` is a section heading, returns its section and any content that
 * followed the heading on the same line (e.g. `Skills: JavaScript, Python`).
 */
export function detectHeading(
  line: string,
  currentSection: SectionType | null = null,
): { section: SectionType; rest: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // "Heading: inline content". Inside the Skills section, labels such as
  // "Languages: JavaScript, Python" are categories, not new sections.
  const inline = trimmed.match(/^([A-Za-z][A-Za-z &/]{1,38}):\s*(\S.*)$/);
  if (inline) {
    const section = HEADING_TO_SECTION[normalizeHeading(inline[1])];
    if (section && !(currentSection === 'skills' && section === 'other')) {
      return { section, rest: inline[2].trim() };
    }
  }

  if (trimmed.length > MAX_HEADING_LENGTH) return null;
  const section = HEADING_TO_SECTION[normalizeHeading(trimmed)];
  return section ? { section, rest: '' } : null;
}

export interface ParsedSections {
  /** Lines before the first recognised heading (name, contact details...). */
  header: string[];
  sections: Record<SectionType, string[]>;
}

/**
 * Splits normalized CV text into sections by heading lines. Repeated headings
 * of the same type are merged. Blank lines are preserved inside sections.
 */
export function splitSections(text: string): ParsedSections {
  const result: ParsedSections = {
    header: [],
    sections: { summary: [], experience: [], education: [], skills: [], projects: [], other: [] },
  };

  let current: SectionType | null = null;
  for (const line of text.split('\n')) {
    const heading = detectHeading(line, current);
    if (heading) {
      current = heading.section;
      if (heading.rest) result.sections[current].push(heading.rest);
      continue;
    }
    if (current === null) {
      result.header.push(line);
    } else {
      result.sections[current].push(line);
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const YEAR = '(?:19|20)\\d{2}';
const DATE_POINT = `(?:${MONTH}\\s+${YEAR}|(?:0?[1-9]|1[0-2])[/.]${YEAR}|${YEAR})`;
const DATE_END = `(?:${DATE_POINT}|present|current|now|ongoing|today|till date|to date)`;

/**
 * A date range such as `Jan 2020 - Present`, `01/2020 - 12/2022`, `2018-2023`.
 * Groups: 1 = start, 2 = end. Not global: safe to use with `.test`/`.match`.
 */
export const DATE_RANGE_RE = new RegExp(
  `\\b(${DATE_POINT})\\s*(?:-|to|until)\\s*(${DATE_END})(?![A-Za-z0-9])`,
  'i',
);

export const SINGLE_YEAR_RE = new RegExp(`\\b(${YEAR})\\b`);

const CURRENT_WORD_RE = /^(?:present|current|now|ongoing|today)$/i;

/** Formats a matched date range as `start - end` (ASCII hyphen, "Present" capitalised). */
export function formatDateRange(match: RegExpMatchArray): string {
  const start = match[1].trim();
  const end = CURRENT_WORD_RE.test(match[2].trim()) ? 'Present' : match[2].trim();
  return `${start} - ${end}`;
}

/* ------------------------------------------------------------------ */
/* Experience / education vocabulary                                   */
/* ------------------------------------------------------------------ */

export const JOB_TITLE_RE =
  /\b(?:engineer|developer|programmer|architect|analyst|consultant|manager|director|lead|specialist|officer|administrator|coordinator|designer|scientist|intern|internship|trainee|associate|executive|technician|tester|assistant|supervisor|founder|co-founder|owner|president|vp|cto|ceo|cfo|researcher|lecturer|instructor|teacher|accountant|representative|devops|sre|qa|head of|principal|staff|freelancer|contractor)\b/i;

export const EMPLOYMENT_TYPE_RE =
  /^(?:full[- ]?time|part[- ]?time|contract|permanent|internship|freelance|remote|hybrid|on-?site)$/i;

export const INSTITUTION_RE =
  /\b(?:university|college|institute|school|academy|polytechnic|faculty|campus|sliit|nsbm|iit|apiit|cinec)\b/i;

export const DEGREE_WORD_RE =
  /\b(?:bachelor(?:'?s)?|master(?:'?s)?|doctor(?:ate)?|diploma|associate(?:'?s)?\s+(?:of|in|degree)|higher national diploma|post-?graduate|undergraduate|mphil|honou?rs degree|degree)\b/i;

/** Abbreviations are matched case-sensitively so "be", "ma", "ms" in prose never match. */
export const DEGREE_ABBR_RE =
  /\b(?:B\.?\s?Sc|B\.?\s?Eng|B\.?\s?Tech|B\.?\s?Com|BBA|MBA|M\.?\s?Sc|M\.?\s?Eng|M\.?\s?Tech|MPhil|Ph\.?\s?D|HND|B\.?A|B\.?S|B\.?E|M\.?A|M\.?S|M\.?E)\b\.?/;

export const GPA_LINE_RE = /\b(?:gpa|cgpa|grade|class|honou?rs|distinction|dean|merit|score)\b|%/i;

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export const BULLET_RE = /^(?:•|\*|-)\s+/;
export const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
export const URL_RE = /(?:https?:\/\/|www\.)\S+/i;
export const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/;
export const NAME_LABEL_RE = /^(?:full\s+)?name\s*[:-]\s*(.+)$/i;
