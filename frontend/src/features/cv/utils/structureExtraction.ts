import type { CvEducation, CvExperience, CvProfile } from '../types/cvProfile';
import {
  BULLET_RE,
  DATE_RANGE_RE,
  DEGREE_ABBR_RE,
  DEGREE_WORD_RE,
  EMPLOYMENT_TYPE_RE,
  GPA_LINE_RE,
  INSTITUTION_RE,
  JOB_TITLE_RE,
  NAME_LABEL_RE,
  SINGLE_YEAR_RE,
  formatDateRange,
  splitSections,
  type ParsedSections,
} from './patterns';
import { findSkillsInText, lookupSkillToken } from './skillDictionary';

/** Spec FR-2 caps. The API re-applies the same limits server-side. */
export const MAX_CAPS = {
  SKILLS: 40,
  SKILL_LENGTH: 48,
  EXPERIENCE: 15,
  EDUCATION: 10,
  SUMMARY_LENGTH: 500,
  EXPERIENCE_SUMMARY_LENGTH: 500,
  FIELD_LENGTH: 200,
  FULL_NAME_LENGTH: 100,
} as const;

/** CV text longer than this is truncated before structuring (spec FR-6). */
export const MAX_CV_TEXT_LENGTH = 50_000;

/* ------------------------------------------------------------------ */
/* Text normalization                                                  */
/* ------------------------------------------------------------------ */

/**
 * Normalizes raw PDF text so the regex-based extractors behave predictably:
 * unified newlines, no control/zero-width characters, `•` bullets, plain
 * hyphens instead of en/em dashes, collapsed spaces and trimmed lines.
 * Idempotent.
 */
export function normalizeCvText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[●▪■◦‣∙·◆►➢➤✓✔]/g, '•')
    .replace(/[–—−]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const cleanPiece = (value: string): string =>
  value.replace(/^[\s,;:|•\-()]+/, '').replace(/[\s,;:|•\-(]+$/, '').trim();

const stripBullet = (line: string): string => line.replace(BULLET_RE, '').trim();

/* ------------------------------------------------------------------ */
/* Skills                                                              */
/* ------------------------------------------------------------------ */

const SKILL_STOPWORDS = new Set([
  'and',
  'or',
  'etc',
  'others',
  'more',
  'various',
  'tools',
  'technologies',
  'frameworks',
  'languages',
  'databases',
  'proficient',
  'familiar',
  'basic',
  'intermediate',
  'advanced',
  'expert',
]);

const splitFlat = (value: string): string[] =>
  value
    .split(/[,;|•\n]|\s{2,}|\s\/\s/)
    .map((token) => token.trim())
    .filter(Boolean);

/** Splits one Skills-section line into candidate tokens. */
function splitSkillTokens(line: string): string[] {
  let working = stripBullet(line);

  // "Languages: JavaScript, Python" -> drop the short category prefix.
  const prefix = working.match(/^([A-Za-z][A-Za-z &/]{1,29}):\s*(.*)$/);
  if (prefix && prefix[1].trim().split(/\s+/).length <= 4) {
    working = prefix[2];
  }

  // "Python (Django, Flask)" -> outer token plus the inner tokens.
  const inner: string[] = [];
  working = working.replace(/\(([^)]*)\)/g, (_match, group: string) => {
    inner.push(...splitFlat(group));
    return ' ';
  });

  return [...splitFlat(working), ...inner];
}

/** Maps a raw token to a display skill, or `undefined` if it does not look like one. */
function toSkill(token: string): string | undefined {
  const cleaned = token.replace(/^[-•*\s]+/, '').replace(/[\s,;:.]+$/, '').trim();
  if (!cleaned) return undefined;

  const known = lookupSkillToken(cleaned);
  if (known) return known;

  if (cleaned.length < 2 || cleaned.length > MAX_CAPS.SKILL_LENGTH) return undefined;
  if (!/^[A-Za-z0-9][A-Za-z0-9 +#.&'/-]*$/.test(cleaned)) return undefined;
  if (/^\d+$/.test(cleaned)) return undefined;
  if (cleaned.split(/\s+/).length > 4) return undefined;
  if (SKILL_STOPWORDS.has(cleaned.toLowerCase())) return undefined;
  return cleaned;
}

function collectSkills(normalizedText: string, skillLines: string[]): string[] {
  const ordered = new Map<string, string>();
  const add = (skill: string | undefined): void => {
    if (!skill) return;
    const key = skill.toLowerCase();
    if (!ordered.has(key)) ordered.set(key, skill);
  };

  // 1. Whatever the candidate listed under Skills, normalized via the dictionary.
  skillLines.forEach((line) => splitSkillTokens(line).forEach((token) => add(toSkill(token))));

  // 2. Dictionary skills mentioned anywhere (experience, projects, summary...).
  findSkillsInText(normalizedText).forEach((skill) => add(skill));

  return Array.from(ordered.values()).slice(0, MAX_CAPS.SKILLS);
}

/**
 * Skills = tokens from the Skills section (dictionary-normalized, unknown
 * tokens kept as typed) + dictionary skills found anywhere in the text.
 * Deduplicated case-insensitively, capped at 40 items of <= 48 chars.
 */
export function extractSkills(text: string): string[] {
  const normalized = normalizeCvText(text);
  return collectSkills(normalized, splitSections(normalized).sections.skills);
}

/* ------------------------------------------------------------------ */
/* Experience                                                          */
/* ------------------------------------------------------------------ */

function splitHeaderPiece(piece: string): string[] {
  const parts = piece
    .split(/\s+\|\s+|\s+@\s+|\s+at\s+|\s+-\s+|\s+•\s+/i)
    .map(cleanPiece)
    .filter(Boolean);

  const result: string[] = [];
  for (const part of parts) {
    const comma = part.indexOf(',');
    if (comma > 0) {
      const head = part.slice(0, comma);
      const tail = part.slice(comma + 1);
      if (JOB_TITLE_RE.test(head) && !JOB_TITLE_RE.test(tail)) {
        result.push(cleanPiece(head), cleanPiece(tail));
        continue;
      }
    }
    result.push(part);
  }
  return result.filter(Boolean);
}

function deriveTitleAndCompany(pieces: string[]): { title: string; company: string } | null {
  const parts = pieces
    .flatMap(splitHeaderPiece)
    .filter((part) => /[A-Za-z]/.test(part) && !EMPLOYMENT_TYPE_RE.test(part))
    .slice(0, 4);

  if (parts.length === 0) return null;

  const titleIndex = parts.findIndex((part) => JOB_TITLE_RE.test(part));
  if (titleIndex === -1) {
    return parts.length >= 2 ? { title: parts[0], company: parts[1] } : null;
  }

  const company = parts.find((part, index) => index !== titleIndex && !JOB_TITLE_RE.test(part));
  return company ? { title: parts[titleIndex], company } : null;
}

const isHeaderCandidate = (line: string): boolean =>
  line !== '' &&
  !BULLET_RE.test(line) &&
  line.length <= 90 &&
  !/[.!?]$/.test(line) &&
  !DATE_RANGE_RE.test(line);

const buildExperience = (
  derived: { title: string; company: string },
  period: string | undefined,
  bodyLines: string[],
): CvExperience => {
  const summary = bodyLines
    .map(stripBullet)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CAPS.EXPERIENCE_SUMMARY_LENGTH);

  const entry: CvExperience = {
    title: derived.title.slice(0, MAX_CAPS.FIELD_LENGTH),
    company: derived.company.slice(0, MAX_CAPS.FIELD_LENGTH),
  };
  if (period) entry.period = period;
  if (summary) entry.summary = summary;
  return entry;
};

/** Entries without any date range: blank-line separated blocks that contain a job title. */
function parseUndatedExperience(lines: string[]): CvExperience[] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line === '') {
      if (current.length) blocks.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);

  const entries: CvExperience[] = [];
  for (const block of blocks) {
    const header = block.filter((line) => !BULLET_RE.test(line)).slice(0, 2);
    if (!JOB_TITLE_RE.test(header.join(' '))) continue;
    const derived = deriveTitleAndCompany(header);
    if (!derived) continue;
    entries.push(buildExperience(derived, undefined, block.filter((line) => BULLET_RE.test(line))));
  }
  return entries;
}

interface ExperienceBlock {
  period: string;
  pieces: string[];
  headerStart: number;
  bodyStart: number;
}

/**
 * Anchors each entry on its date-range line. The title/company text is the
 * (up to two) short lines directly above the date line, the text on the date
 * line itself, or - for "date first" layouts - the lines directly below it.
 * Everything up to the next entry's header is the entry's summary.
 */
function parseExperienceLines(lines: string[]): CvExperience[] {
  const dateLines: number[] = [];
  lines.forEach((line, index) => {
    if (line && !BULLET_RE.test(line) && line.length <= 120 && DATE_RANGE_RE.test(line)) {
      dateLines.push(index);
    }
  });

  if (dateLines.length === 0) return parseUndatedExperience(lines);

  const blocks: ExperienceBlock[] = [];
  let lowerBound = 0;

  for (const dateIndex of dateLines) {
    const match = lines[dateIndex].match(DATE_RANGE_RE);
    if (!match) continue;

    const remainder = cleanPiece(lines[dateIndex].replace(DATE_RANGE_RE, ' '));
    const above: string[] = [];
    for (
      let i = dateIndex - 1;
      i >= lowerBound && above.length < 2 && isHeaderCandidate(lines[i]);
      i--
    ) {
      above.unshift(lines[i]);
    }

    const pieces = [...above];
    if (/[A-Za-z]/.test(remainder)) pieces.push(remainder);

    let headerStart = dateIndex - above.length;
    let bodyStart = dateIndex + 1;

    if (pieces.length === 0) {
      const below: string[] = [];
      let j = dateIndex + 1;
      while (
        j < lines.length &&
        below.length < 2 &&
        isHeaderCandidate(lines[j]) &&
        !dateLines.includes(j)
      ) {
        below.push(lines[j]);
        j++;
      }
      pieces.push(...below);
      headerStart = dateIndex;
      bodyStart = j;
    }

    blocks.push({ period: formatDateRange(match), pieces, headerStart, bodyStart });
    lowerBound = bodyStart;
  }

  const entries: CvExperience[] = [];
  blocks.forEach((block, index) => {
    const derived = deriveTitleAndCompany(block.pieces);
    if (!derived) return;
    const end = index + 1 < blocks.length ? blocks[index + 1].headerStart : lines.length;
    entries.push(buildExperience(derived, block.period, lines.slice(block.bodyStart, end)));
  });
  return entries;
}

/**
 * Experience entries from the Experience section. An entry needs both a title
 * and a company (nothing is guessed); the period and bullet summary are optional.
 */
export function extractExperience(text: string): CvExperience[] {
  const lines = splitSections(normalizeCvText(text)).sections.experience;
  return parseExperienceLines(lines).slice(0, MAX_CAPS.EXPERIENCE);
}

/* ------------------------------------------------------------------ */
/* Education                                                           */
/* ------------------------------------------------------------------ */

function extractYear(line: string): string | undefined {
  const range = line.match(DATE_RANGE_RE);
  if (range) return formatDateRange(range);
  return line.match(SINGLE_YEAR_RE)?.[1];
}

const stripYears = (line: string): string =>
  line
    .replace(DATE_RANGE_RE, ' ')
    .replace(new RegExp(SINGLE_YEAR_RE.source, 'g'), ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isDegree = (piece: string): boolean => DEGREE_WORD_RE.test(piece) || DEGREE_ABBR_RE.test(piece);

function parseDegreePiece(piece: string): { degree: string; field?: string } {
  const split = piece.match(/^(.+?)\s+in\s+(.+)$/i);
  if (split) {
    return { degree: cleanPiece(split[1]), field: cleanPiece(split[2]) };
  }
  return { degree: cleanPiece(piece) };
}

function parseEducationLines(lines: string[]): CvEducation[] {
  const entries: CvEducation[] = [];
  let current: Partial<CvEducation> = {};

  const flush = (): void => {
    if (current.institution) {
      const entry: CvEducation = { institution: current.institution.slice(0, MAX_CAPS.FIELD_LENGTH) };
      if (current.degree) entry.degree = current.degree.slice(0, 100);
      if (current.field) entry.field = current.field.slice(0, 100);
      if (current.year) entry.year = current.year.slice(0, 20);
      entries.push(entry);
    }
    current = {};
  };

  for (const rawLine of lines) {
    const line = stripBullet(rawLine);
    if (!line) continue;

    const year = extractYear(line);
    const pieces = stripYears(line)
      .split(/\s*\|\s*|\s*;\s*|\s+-\s+|\s*,\s*/)
      .map(cleanPiece)
      .filter(Boolean);

    const degreePiece = pieces.find(isDegree);
    const institutionPiece = pieces.find((piece) => INSTITUTION_RE.test(piece));

    if ((institutionPiece && current.institution) || (degreePiece && current.degree)) {
      flush();
    }

    if (institutionPiece) current.institution = institutionPiece;
    if (degreePiece) {
      const parsed = parseDegreePiece(degreePiece);
      current.degree = parsed.degree;
      if (parsed.field) current.field = parsed.field;
    }
    if (year && !current.year) current.year = year;

    // A short plain line after a degree is most likely the institution ("MIT").
    if (
      !institutionPiece &&
      !degreePiece &&
      current.degree &&
      !current.institution &&
      pieces.length > 0 &&
      pieces[0].length <= 60 &&
      !/\d/.test(pieces[0]) &&
      !GPA_LINE_RE.test(pieces[0])
    ) {
      current.institution = pieces[0];
    }
  }
  flush();

  return entries;
}

/**
 * Education entries from the Education section. An entry needs an institution;
 * degree, field and year are optional.
 */
export function extractEducation(text: string): CvEducation[] {
  const lines = splitSections(normalizeCvText(text)).sections.education;
  return parseEducationLines(lines).slice(0, MAX_CAPS.EDUCATION);
}

/* ------------------------------------------------------------------ */
/* Name and summary                                                    */
/* ------------------------------------------------------------------ */

const NAME_WORD_RE = /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'.-]*$/;
const NAME_PARTICLES = new Set(['de', 'da', 'del', 'di', 'van', 'von', 'bin', 'al', 'la', 'le']);
const NAME_STOPWORDS_RE =
  /\b(?:resume|curriculum|vitae|cv|profile|summary|contact|address|email|phone|student|intern)\b/i;

function isLikelyName(candidate: string): boolean {
  if (candidate.length > 60 || /[\d@:]/.test(candidate)) return false;
  if (NAME_STOPWORDS_RE.test(candidate) || JOB_TITLE_RE.test(candidate)) return false;

  const words = candidate.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;

  return words.every((word) => {
    if (!NAME_WORD_RE.test(word)) return false;
    return /^[A-Z\u00C0-\u00DE]/.test(word) || NAME_PARTICLES.has(word.toLowerCase());
  });
}

const toTitleCase = (value: string): string =>
  value
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z\u00e0-\u00ff])/g, (_match, lead: string, char: string) => lead + char.toUpperCase());

function pickName(normalizedText: string, header: string[]): string | undefined {
  for (const raw of header.slice(0, 10)) {
    const line = stripBullet(raw);
    if (!line) continue;
    const candidate = line.match(NAME_LABEL_RE)?.[1].trim() ?? line;
    if (isLikelyName(candidate)) {
      return candidate === candidate.toUpperCase() ? toTitleCase(candidate) : candidate;
    }
  }

  // "Name: Jane Doe" inside a contact block further down.
  for (const line of normalizedText.split('\n')) {
    const label = line.match(NAME_LABEL_RE)?.[1].trim();
    if (label && isLikelyName(label)) {
      return label === label.toUpperCase() ? toTitleCase(label) : label;
    }
  }
  return undefined;
}

function pickSummary(parsed: ParsedSections): string | undefined {
  const summary = parsed.sections.summary
    .map(stripBullet)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CAPS.SUMMARY_LENGTH);
  return summary || undefined;
}

/**
 * Name: first plausible name-like line (2-4 capitalised words) near the top,
 * or a `Name:` label. Summary: content of the Summary/Profile/About section
 * (no guessing from arbitrary paragraphs). Capped at 500 chars.
 */
export function extractNameAndSummary(text: string): { fullName?: string; summary?: string } {
  const normalized = normalizeCvText(text);
  const parsed = splitSections(normalized);
  const result: { fullName?: string; summary?: string } = {};

  const fullName = pickName(normalized, parsed.header);
  if (fullName) result.fullName = fullName.slice(0, MAX_CAPS.FULL_NAME_LENGTH);

  const summary = pickSummary(parsed);
  if (summary) result.summary = summary;

  return result;
}

/* ------------------------------------------------------------------ */
/* Orchestrator                                                        */
/* ------------------------------------------------------------------ */

/**
 * Builds the `CvProfile` for the extracted CV text. Throws on empty input or a
 * missing S3 key; never throws for CVs it simply cannot understand (arrays
 * are then empty).
 */
export function structureCvProfile(text: string, sourceCvS3Key: string): CvProfile {
  if (!text || text.trim().length === 0) {
    throw new Error('CV text is empty or invalid');
  }
  if (!sourceCvS3Key || sourceCvS3Key.trim().length === 0) {
    throw new Error('sourceCvS3Key is required');
  }

  const normalized = normalizeCvText(text.slice(0, MAX_CV_TEXT_LENGTH));
  const parsed = splitSections(normalized);

  const profile: CvProfile = {
    skills: collectSkills(normalized, parsed.sections.skills),
    experience: parseExperienceLines(parsed.sections.experience).slice(0, MAX_CAPS.EXPERIENCE),
    education: parseEducationLines(parsed.sections.education).slice(0, MAX_CAPS.EDUCATION),
    extractedAt: new Date().toISOString(),
    sourceCvS3Key,
  };

  const fullName = pickName(normalized, parsed.header);
  if (fullName) profile.fullName = fullName.slice(0, MAX_CAPS.FULL_NAME_LENGTH);

  const summary = pickSummary(parsed);
  if (summary) profile.summary = summary;

  return profile;
}

/** True when the extractor found nothing useful (e.g. text of an image-only or garbled PDF). */
export function isEmptyCvProfile(profile: CvProfile): boolean {
  return (
    profile.skills.length === 0 &&
    profile.experience.length === 0 &&
    profile.education.length === 0 &&
    !profile.fullName &&
    !profile.summary
  );
}
