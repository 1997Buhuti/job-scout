/**
 * Regex patterns for CV section detection, date matching, and structured extraction
 */

/**
 * Section headers commonly found in CVs (case-insensitive)
 */
export const SECTION_HEADERS = {
  SKILLS: /(?:^|\n)\s* Skills \s*(?:\n|:|$)/i,
  EXPERIENCE: /(?:^|\n)\s* (?:Experience|Work History|Employment|Professional Experience) \s*(?:\n|:|$)/i,
  EDUCATION: /(?:^|\n)\s* (?:Education|Academic Background|Academic Experience|Qualifications) \s*(?:\n|:|$)/i,
  SUMMARY: /(?:^|\n)\s* (?:Summary|Profile|About Me|Professional Summary|Career Summary) \s*(?:\n|:|$)/i,
  CONTACT: /(?:^|\n)\s* (?:Contact|Contact Information|Personal Details) \s*(?:\n|:|$)/i,
  PROJECTS: /(?:^|\n)\s* (?:Projects|Project Experience) \s*(?:\n|:|$)/i,
  CERTIFICATIONS: /(?:^|\n)\s* (?:Certifications|Certifications & Licenses) \s*(?:\n|:|$)/i,
  ACHIEVEMENTS: /(?:^|\n)\s* (?:Achievements|Awards|Recognitions) \s*(?:\n|:|$)/i,
};

/**
 * Date patterns for experience period extraction
 * Matches: MM/YYYY, Month YYYY, YYYY-YYYY, YYYY-Present, Month YYYY - Month YYYY, etc.
 */
export const DATE_PATTERNS = {
  /** MM/YYYY format */
  MONTH_YEAR: /(\b(?:0[1-9]|1[0-2])\/\d{4}\b)/i,
  /** Month YYYY format (e.g., "January 2020") */
  FULL_MONTH_YEAR: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/i,
  /** Year range YYYY-YYYY */
  YEAR_RANGE: /(\b\d{4}\b)\s*[-–]\s*(\b\d{4}\b|\bPresent\b)/i,
  /** Single year */
  SINGLE_YEAR: /\b(19|20)\d{2}\b/g,
  /** Present/Current */
  PRESENT: /\b(?:Present|Current|Currently|Till Date|Presently)\b/i,
};

/**
 * Degree patterns for education extraction
 */
export const DEGREE_PATTERNS = {
  /** Bachelor's degree */
  BACHELORS: /\b(?:Bachelor['"]?\s*(?:of|in)?|B\.\w{1,2}\.|\bBSc\b|\bBE\b|\bBEng\b|BA|BFA)\s+(?:\w+\s*)*$/i,
  /** Master's degree */
  MASTERS: /\b(?:Master['"]?\s*(?:of|in)?|M\.\w{1,2}\.|\bMSc\b|\bME\b|\bMEng\b|MA|MFA|MBA)\s+(?:\w+\s*)*$/i,
  /** Doctoral degree */
  DOCTORAL: /\b(?:Doctor of Philosophy|Ph\.?D\.?|Doctorate)\s+(?:\w+\s*)*$/i,
  /** Associate degree */
  ASSOCIATE: /\b(?:Associate['"]?\s*(?:of|in)?|A\.\w{1,2}\.)\s+(?:\w+\s*)*$/i,
  /** Diploma/Certificate */
  DIPLOMA: /\b(?:Diploma|Certificate)\s+(?:in|of)?\s+\w+/i,
  /** General degree pattern */
  GENERIC_DEGREE: /\b(?:Bachelor|Master|Doctor|Associate|Diploma|Certificate)\s+(?:of|in)?\s*(?:\w+\s*)+/i,
};

/**
 * Company name patterns (follows title/position)
 */
export const COMPANY_PATTERNS = {
  /** Company after title on same line */
  ON_SAME_LINE: /(?:at|at\s+the\s+company|for)\s+([A-Z][A-Za-z0-9\s&',.]+?)(?=\s*(?:,|\s+–|\s+-|\s+at|\n|$))/i,
  /** Company on next line after title */
  ON_NEXT_LINE: /(?:^|\n)\s*[^@\s\n]+(?:\s+[^@\s\n]+)*\s*(?:\n)([A-Z][A-Za-z0-9\s&',.]+?)(?=\s*(?:,|\.|\s+–|\s+-|\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|\s+(?:0[1-9]|1[0-2])\/|\s+(?:19|20)\d{2}|\n|$))/i,
};

/**
 * Title/Position patterns
 */
export const TITLE_PATTERNS = {
  /** Job title followed by date or company */
  MAIN: /\b(?:Software|Senior|Lead|Principal|Staff|Principal|Junior|Associate|Junior|Senior|Tech Lead|Engineering|Product|Project|Account|Client|Business|Data|Machine Learning|DevOps|System|Network|Security|Quality|Quality Assurance|Full Stack|Frontend|Backend|Mobile|Web|Desktop|Cloud|Infrastructure|SRE|Site Reliability|Application|Database|Systems|Technical|Technical Support|Customer|Sales|Marketing|Finance|HR|Recruiter|Manager|Director|VP|CEO|CTO|CFO|COO|Head|Chief)\s+(?:Engineer|Developer|Programmer|Architect|Analyst|Consultant|Specialist|Officer|Administrator|Coordinator|Manager|Director|Lead|Senior|Principal|Junior|Associate|Staff)\s*(?:\w+\s*)*/i,
  /** Generic job title pattern */
  GENERIC: /\b(?:[A-Z][a-z]+\s+){1,3}(?:Engineer|Developer|Programmer|Architect|Analyst|Consultant|Specialist|Officer|Administrator|Coordinator|Manager|Director|Lead|Senior|Principal|Junior|Associate|Staff|Head|Chief)\b/i,
};

/**
 * Name patterns (at top of document)
 */
export const NAME_PATTERNS = {
  /** Full name at top (2-4 words, typically capitalized) */
  TOP_DOCUMENT: /^(?:\s*\n)*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})(?=\s*(?:\n|$))/m,
  /** Name with email below */
  WITH_EMAIL: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}).*?[@\w.-]+\.\w+/si,
  /** Name in contact section */
  CONTACT_SECTION: /(?:Name|Full Name|Fullname)\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
};

/**
 * Summary/profile section patterns
 */
export const SUMMARY_PATTERNS = {
  /** Summary section content */
  SECTION: /(?:^|\n)\s*(?:Summary|Profile|About Me|Professional Summary|Career Summary)\s*(?:\n|:|–|-)([\s\S]*?)(?=\n\s*(?:Experience|Education|Skills|Projects|Certifications|Achievements|References|$))/is,
  /** First paragraph as summary fallback */
  FIRST_PARAGRAPH: /^(?:\s*\n)*([^\n]{50,500})(?=\n\n|\n\s*\n|\n\s*(?:Experience|Education|Skills))/s,
};

/**
 * Generic extractors for experience entries
 */
export const EXPERIENCE_ENTRY_PATTERNS = {
  /** Single experience entry with title, company, period */
  MAIN: /([\s\S]*?)(?=(?:^|\n)\s*(?:Experience|Work History|Employment|Professional Experience)|$)/is,
  /** Bullet points within experience */
  BULLET: /^\s*[•\-\*]\s+(.+)$/gm,
  /** Summary line after title/company */
  SUMMARY_LINE: /(?:^|\n)\s*[-–—]\s*(.+?)(?=\n\n|\n\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*|$))/s,
};

/**
 * Skills extraction patterns
 */
export const SKILL_PATTERNS = {
  /** Skills listed as comma-separated */
  COMMA_SEPARATED: /(?:^|\n)\s*Skills?\s*[:\-]?\s*([\s\S]*?)(?=\n\s*\n|\n\s*(?:Experience|Education|Projects|Certifications|$))/is,
  /** Skills listed as bullet points */
  BULLET_POINTS: /(?:^|\n)\s*Skills?\s*[:\-]?(?:\n\s*[•\-\*]\s+.+)+/is,
  /** Individual skill in a list */
  INDIVIDUAL: /^\s*[•\-\*]?\s*([A-Za-z][A-Za-z0-9+#&.]+(?:\s+[A-Za-z][A-Za-z0-9+#&.]*)?)/m,
  /** Inline skill mention */
  INLINE: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?:\s+and|\s*,\s*|\s+or\s+)/g,
};

/**
 * Email pattern (for contact info)
 */
export const EMAIL_PATTERN = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;

/**
 * Phone pattern (for contact info)
 */
export const PHONE_PATTERN = /\b(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g;

/**
 * LinkedIn URL pattern
 */
export const LINKEDIN_PATTERN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/gi;
