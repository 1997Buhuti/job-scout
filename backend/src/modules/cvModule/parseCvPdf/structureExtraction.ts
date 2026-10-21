import type { CvProfile, CvExperience, CvEducation } from './types';
import { SKILL_DICTIONARY, VARIATION_TO_CANONICAL } from './skillDictionary';
import { SECTION_HEADERS, DATE_PATTERNS, DEGREE_PATTERNS, TITLE_PATTERNS, NAME_PATTERNS, SUMMARY_PATTERNS, EXPERIENCE_ENTRY_PATTERNS, SKILL_PATTERNS } from './patterns';

/**
 * Max caps for extracted data
 */
export const MAX_CAPS = {
  SKILLS: 40,
  SKILL_LENGTH: 48,
  EXPERIENCE: 15,
  EDUCATION: 10,
  SUMMARY_LENGTH: 500,
  EXPERIENCE_SUMMARY_LENGTH: 500,
};

/**
 * Extract skills from CV text
 * 1. Look for explicit Skills section
 * 2. Match against curated skill dictionary using case-insensitive fuzzy matching
 * 3. Extract from bullet points and experience descriptions
 * 4. Deduplicate and normalize
 * 5. Cap at MAX_CAPS.SKILLS items, each max MAX_CAPS.SKILL_LENGTH chars
 */
export function extractSkills(text: string): string[] {
  const skills: Set<string> = new Set();
  const textLower = text.toLowerCase();

  // 1. Extract from explicit Skills section if present
  const skillsSectionMatch = text.match(SECTION_HEADERS.SKILLS);
  if (skillsSectionMatch) {
    const skillsSectionStart = skillsSectionMatch.index || 0;
    const skillsSectionEnd = text.substring(skillsSectionStart).search(/\n\s*\n|\n\s*(?:Experience|Education|Projects|Certifications|Achievements|$)/);
    const skillsSectionContent = text.substring(
      skillsSectionStart,
      skillsSectionStart + skillsSectionEnd
    );

    // Match individual skills (comma-separated or bullet points)
    const skillMatches = skillsSectionContent.match(/(?:^|\n|,|•|\-)\s*([A-Za-z][A-Za-z0-9+#&.\s-]{0,47})/gm);
    if (skillMatches) {
      skillMatches.forEach((match) => {
        const skill = match.trim().replace(/^•\s*|-?\s*/, '').replace(/,$/, '').trim();
        if (skill && skill.length > 0) {
          skills.add(skill.substring(0, MAX_CAPS.SKILL_LENGTH));
        }
      });
    }
  }

  // 2. Match against skill dictionary for all skills in text
  Object.entries(SKILL_DICTIONARY).forEach(([canonical, variations]) => {
    variations.forEach((variation) => {
      if (textLower.includes(variation.toLowerCase())) {
        skills.add(canonical.substring(0, MAX_CAPS.SKILL_LENGTH));
      }
    });
  });

  // 3. Extract from experience descriptions (technical terms)
  const experienceMatch = text.match(SECTION_HEADERS.EXPERIENCE);
  if (experienceMatch) {
    const experienceStart = experienceMatch.index || 0;
    const experienceSection = text.substring(experienceStart).split('\n\n')[0];
    const techWords = experienceSection.match(/\b(?:JavaScript|TypeScript|Python|Java|CSharp|CPlusPlus|Go|Rust|Swift|Kotlin|PHP|Ruby|Scala|Perl|Haskell|R|Matlab|Lua|Dart|SQL|Shell|React|Redux|NextJS|Vue|Angular|NodeJS|Express|Koa|NestJS|AWS|Docker|Kubernetes|Git|MongoDB|PostgreSQL|Redis|Elasticsearch|Jest|Cypress|Selenium|Linux|Windows|Mac)\b/gi);
    if (techWords) {
      techWords.forEach((word) => {
        skills.add(word.substring(0, MAX_CAPS.SKILL_LENGTH));
      });
    }
  }

  // Convert to array, limit to MAX_CAPS.SKILLS
  const skillsArray = Array.from(skills).slice(0, MAX_CAPS.SKILLS);

  // Remove empty strings and ensure all are trimmed
  return skillsArray
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0 && skill !== '-');
}

/**
 * Extract experience entries from CV text
 * 1. Look for Experience section
 * 2. Pattern match job titles, company names, date ranges
 * 3. Extract from bullet points and experience descriptions
 * 4. Cap at MAX_CAPS.EXPERIENCE entries
 */
export function extractExperience(text: string): CvExperience[] {
  const experiences: CvExperience[] = [];
  const textLines = text.split('\n');

  // Find Experience section
  const experienceMatch = text.match(SECTION_HEADERS.EXPERIENCE);
  if (!experienceMatch) {
    // Try to extract from general text if no explicit section
    return extractExperienceFromText(text);
  }

  const experienceStart = experienceMatch.index || 0;
  const experienceSection = text.substring(experienceStart);

  // Split by Experience section markers
  const sectionEndMatch = experienceSection.match(/\n\s*(?:Education|Projects|Certifications|Achievements|Skills|References|$)/i);
  const experienceContent = sectionEndMatch
    ? experienceSection.substring(0, sectionEndMatch.index || experienceSection.length)
    : experienceSection;

  // Parse individual experience entries
  const lines = experienceContent.split('\n');
  let currentExperience: Partial<CvExperience> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and section headers
    if (!line || line.match(/^(?:Experience|Work History|Employment|Professional Experience)$/i)) {
      if (currentExperience.title && currentExperience.company) {
        experiences.push(finalizeExperience(currentExperience));
        currentExperience = {};
      }
      continue;
    }

    // Try to extract title (job position)
    if (!currentExperience.title) {
      const title = extractJobTitle(line);
      if (title) {
        currentExperience.title = title;
        continue;
      }
    }

    // Try to extract company
    if (currentExperience.title && !currentExperience.company) {
      const company = extractCompany(line);
      if (company) {
        currentExperience.company = company;
        continue;
      }
    }

    // Try to extract period
    if (!currentExperience.period) {
      const period = extractPeriod(line);
      if (period) {
        currentExperience.period = period;
        continue;
      }
    }

    // Try to extract summary (bullet points after title/company/period)
    if (currentExperience.title && currentExperience.company) {
      const summary = extractExperienceSummary(line);
      if (summary) {
        currentExperience.summary = (currentExperience.summary || '') + (currentExperience.summary ? ' ' : '') + summary;
      }
    }
  }

  // Don't forget the last entry
  if (currentExperience.title && currentExperience.company) {
    experiences.push(finalizeExperience(currentExperience));
  }

  // Cap at MAX_CAPS.EXPERIENCE
  return experiences.slice(0, MAX_CAPS.EXPERIENCE);
}

/**
 * Fallback: Extract experience from general text without explicit section
 */
function extractExperienceFromText(text: string): CvExperience[] {
  const experiences: CvExperience[] = [];
  const lines = text.split('\n');

  // Look for patterns like "Job Title at Company" or "Company - Job Title"
  const experiencePattern = /(.+?(?:Engineer|Developer|Programmer|Architect|Analyst|Consultant|Manager|Director|Lead|Specialist|Officer|Administrator|Coordinator))\s*(?:at|for|–|-|—)\s*(.+)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(experiencePattern);
    if (match) {
      const title = match[1].trim();
      const company = match[2].trim();

      // Try to extract date from next line
      let period: string | undefined;
      if (i + 1 < lines.length) {
        period = extractPeriod(lines[i + 1].trim());
      }

      experiences.push({
        title: title.substring(0, 200),
        company: company.substring(0, 200),
        period,
      });

      // Cap at MAX_CAPS.EXPERIENCE
      if (experiences.length >= MAX_CAPS.EXPERIENCE) {
        break;
      }
    }
  }

  return experiences;
}

/**
 * Extract education entries from CV text
 * 1. Look for Education section
 * 2. Detect degree types, institution names, graduation years
 * 3. Cap at MAX_CAPS.EDUCATION entries
 */
export function extractEducation(text: string): CvEducation[] {
  const education: CvEducation[] = [];
  const textLines = text.split('\n');

  // Find Education section
  const educationMatch = text.match(SECTION_HEADERS.EDUCATION);
  if (!educationMatch) {
    // Try to extract from general text if no explicit section
    return extractEducationFromText(text);
  }

  const educationStart = educationMatch.index || 0;
  const educationSection = text.substring(educationStart);

  // Find end of Education section
  const sectionEndMatch = educationSection.match(/\n\s*(?:Experience|Projects|Certifications|Achievements|Skills|References|$)/i);
  const educationContent = sectionEndMatch
    ? educationSection.substring(0, sectionEndMatch.index || educationSection.length)
    : educationSection;

  // Parse individual education entries
  const lines = educationContent.split('\n');
  let currentEducation: Partial<CvEducation> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and section headers
    if (!line || line.match(/^(?:Education|Academic Background|Academic Experience|Qualifications)$/i)) {
      if (currentEducation.institution) {
        education.push(finalizeEducation(currentEducation));
        currentEducation = {};
      }
      continue;
    }

    // Try to extract institution (first line that's not a degree)
    if (!currentEducation.institution && !line.match(/^(?:Bachelor|Master|Doctor|Associate|Diploma|Certificate|B\.Sc|M\.Sc|Ph\.D|BEng|BE|MEng|ME|BA|MA|MBA|BFA|MFA)\b/i)) {
      currentEducation.institution = line.substring(0, 200);
      continue;
    }

    // Try to extract degree
    if (!currentEducation.degree) {
      const degree = extractDegree(line);
      if (degree) {
        currentEducation.degree = degree;
        continue;
      }
    }

    // Try to extract year
    if (!currentEducation.year) {
      const year = extractYear(line);
      if (year) {
        currentEducation.year = year;
        continue;
      }
    }

    // Try to extract field of study
    if (currentEducation.degree && !currentEducation.field) {
      const field = extractFieldOfStudy(line);
      if (field) {
        currentEducation.field = field.substring(0, 100);
      }
    }
  }

  // Don't forget the last entry
  if (currentEducation.institution) {
    education.push(finalizeEducation(currentEducation));
  }

  // Cap at MAX_CAPS.EDUCATION
  return education.slice(0, MAX_CAPS.EDUCATION);
}

/**
 * Fallback: Extract education from general text without explicit section
 */
function extractEducationFromText(text: string): CvEducation[] {
  const education: CvEducation[] = [];
  const lines = text.split('\n');

  // Look for patterns like "Bachelor of Science in Computer Science" followed by institution
  const degreePattern = /\b(?:Bachelor|Master|Doctor|Associate|Diploma|Certificate)\s+(?:of\s+)?(?:\w+\s+)*(?:in\s+)?([A-Za-z\s]+?)\b/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(degreePattern);
    if (match) {
      const degree = match[0].trim();
      const institution = lines[i + 1]?.trim() || '';

      // Try to extract year from next few lines
      let year: string | undefined;
      for (let j = 1; j <= 3 && i + j < lines.length; j++) {
        year = extractYear(lines[i + j].trim());
        if (year) break;
      }

      education.push({
        institution: institution.substring(0, 200),
        degree: degree.substring(0, 100),
        year,
      });

      // Cap at MAX_CAPS.EDUCATION
      if (education.length >= MAX_CAPS.EDUCATION) {
        break;
      }
    }
  }

  return education;
}

/**
 * Extract name and summary from CV text
 * 1. Extract name from top of document or explicit "Name:" field
 * 2. Extract professional summary from intro sections
 * 3. Cap summary at MAX_CAPS.SUMMARY_LENGTH chars
 */
export function extractNameAndSummary(text: string): { fullName?: string; summary?: string } {
  const result: { fullName?: string; summary?: string } = {};

  // Extract name
  const nameMatch = text.match(NAME_PATTERNS.TOP_DOCUMENT);
  if (nameMatch && nameMatch[1]) {
    result.fullName = nameMatch[1].trim();
  }

  // Extract summary
  const summaryMatch = text.match(SUMMARY_PATTERNS.SECTION);
  if (summaryMatch && summaryMatch[1]) {
    let summary = summaryMatch[1].trim();
    // Clean up summary
    summary = summary.replace(/\s+/g, ' ').substring(0, MAX_CAPS.SUMMARY_LENGTH);
    if (summary) {
      result.summary = summary;
    }
  } else {
    // Fallback: use first paragraph as summary
    const firstParagraph = text.split('\n\n')[0].trim();
    if (firstParagraph.length > 50 && firstParagraph.length <= MAX_CAPS.SUMMARY_LENGTH) {
      result.summary = firstParagraph.substring(0, MAX_CAPS.SUMMARY_LENGTH);
    }
  }

  return result;
}

/**
 * Finalize experience entry with validation
 */
function finalizeExperience(exp: Partial<CvExperience>): CvExperience {
  const result: CvExperience = {
    title: (exp.title || '').substring(0, 200).trim(),
    company: (exp.company || '').substring(0, 200).trim(),
    period: exp.period ? exp.period.substring(0, 100).trim() : undefined,
    summary: exp.summary ? exp.summary.substring(0, MAX_CAPS.EXPERIENCE_SUMMARY_LENGTH).trim() : undefined,
  };

  // Only include fields that have values
  if (!result.period) delete result.period;
  if (!result.summary) delete result.summary;

  return result;
}

/**
 * Finalize education entry with validation
 */
function finalizeEducation(edu: Partial<CvEducation>): CvEducation {
  const result: CvEducation = {
    institution: (edu.institution || '').substring(0, 200).trim(),
    degree: edu.degree ? edu.degree.substring(0, 100).trim() : undefined,
    field: edu.field ? edu.field.substring(0, 100).trim() : undefined,
    year: edu.year ? edu.year.substring(0, 20).trim() : undefined,
  };

  // Only include fields that have values
  if (!result.degree) delete result.degree;
  if (!result.field) delete result.field;
  if (!result.year) delete result.year;

  return result;
}

/**
 * Extract job title from a line of text
 */
function extractJobTitle(line: string): string | null {
  const titlePattern = /\b(?:Software|Senior|Lead|Principal|Staff|Junior|Associate|Tech|Engineering|Product|Project|Account|Client|Business|Data|Machine Learning|DevOps|System|Network|Security|Quality|Full Stack|Frontend|Backend|Mobile|Web|Desktop|Cloud|Infrastructure|SRE|Site Reliability|Application|Database|Systems|Technical|Customer|Sales|Marketing|Finance|HR|Recruiter|Manager|Director|VP|CEO|CTO|CFO|COO|Head|Chief)\s+(?:Engineer|Developer|Programmer|Architect|Analyst|Consultant|Specialist|Officer|Administrator|Coordinator|Manager|Director|Lead|Senior|Principal|Junior|Associate|Staff|Head|Chief)\b/i;
  const match = line.match(titlePattern);
  if (match) {
    return match[0].trim();
  }

  // Generic fallback
  const genericPattern = /\b(?:[A-Z][a-z]+\s+){1,3}(?:Engineer|Developer|Programmer|Architect|Analyst|Consultant|Specialist|Officer|Administrator|Coordinator|Manager|Director|Lead|Senior|Principal|Junior|Associate|Staff|Head|Chief)\b/;
  const genericMatch = line.match(genericPattern);
  if (genericMatch) {
    return genericMatch[0].trim();
  }

  return null;
}

/**
 * Extract company name from a line of text
 */
function extractCompany(line: string): string | null {
  // Look for "at Company" pattern
  const atPattern = /(?:at|for|working\s+at|employee\s+at)\s+([A-Z][A-Za-z0-9\s&',.]+?)(?=\s*(?:,|\.|\s+at|\n|$))/i;
  const atMatch = line.match(atPattern);
  if (atMatch) {
    return atMatch[1].trim();
  }

  // Look for "Company - Title" or "Company: Title" pattern
  const dashPattern = /([A-Z][A-Za-z0-9\s&',.]+?)\s*[-–—]\s*(?:Software|Senior|Lead|Principal|Engineer|Developer|Programmer|Architect|Analyst|Consultant|Manager|Director|VP)/i;
  const dashMatch = line.match(dashPattern);
  if (dashMatch) {
    return dashMatch[1].trim();
  }

  // Look for standalone company name (all caps or PascalCase)
  const companyPattern = /\b([A-Z][A-Za-z0-9\s&',.]+?)(?=\s*(?:Engineer|Developer|Programmer|Architect|Analyst|Consultant|Manager|Director|VP|at|for|-|,|\.|$))/i;
  const companyMatch = line.match(companyPattern);
  if (companyMatch) {
    const candidate = companyMatch[1].trim();
    // Filter out likely non-company names
    if (!candidate.match(/^(?:Engineer|Developer|Programmer|Architect|Analyst|Consultant|Manager|Director|VP|CEO|CTO|CFO|COO|Lead|Senior|Junior|Associate|Principal|Staff)$/i)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Extract period/date range from a line of text
 */
function extractPeriod(line: string): string | null {
  // Year range: 2020 - 2023 or 2020 - Present
  const rangePattern = /(\d{4})\s*[-–—]\s*(\d{4}|Present|Current)/i;
  const rangeMatch = line.match(rangePattern);
  if (rangeMatch) {
    return `${rangeMatch[1]} – ${rangeMatch[2]}`;
  }

  // Month Year format: January 2020
  const monthYearPattern = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/i;
  const monthYearMatch = line.match(monthYearPattern);
  if (monthYearMatch) {
    return monthYearMatch[0];
  }

  // Month-Month Year format: Jan 2020 - Dec 2020
  const monthRangePattern = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*[-–—]\s*(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/i;
  const monthRangeMatch = line.match(monthRangePattern);
  if (monthRangeMatch) {
    return monthRangeMatch[0];
  }

  // MM/YYYY format
  const mmYyyyPattern = /\b(0[1-9]|1[0-2])\/(\d{4})\b/g;
  const mmYyyyMatches = Array.from(line.matchAll(mmYyyyPattern));
  if (mmYyyyMatches.length >= 2) {
    return `${mmYyyyMatches[0][0]} – ${mmYyyyMatches[1][0]}`;
  }

  return null;
}

/**
 * Extract experience summary from a line of text
 */
function extractExperienceSummary(line: string): string | null {
  // Skip lines that are clearly titles, companies, or dates
  if (line.match(/^(?:Software|Senior|Lead|Principal|Engineer|Developer|Programmer|Architect|Analyst|Consultant|Manager|Director|VP|CEO|CTO|CFO|COO|Lead|Senior|Junior|Associate|Staff)\s+/i)) return null;
  if (line.match(/^[A-Z][A-Za-z0-9\s&',.]+\s*[-–—]\s*/)) return null;
  if (line.match(/\b(0[1-9]|1[0-2])\/\d{4}\b/)) return null;
  if (line.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/i)) return null;
  if (line.match(/\b\d{4}\s*[-–—]\s*(?:\d{4}|Present)\b/i)) return null;

  // This looks like a summary/description line
  const summary = line.replace(/^[•\-\*]\s*/, '').trim();
  return summary.length > 0 ? summary : null;
}

/**
 * Extract degree from a line of text
 */
function extractDegree(line: string): string | null {
  // Bachelor's
  if (line.match(/\b(?:Bachelor|B\.Sc|BE|BEng|BA|BFA)\b/i)) {
    const match = line.match(/\b(?:Bachelor(?:'s)?(?: of \w+)?|B\.Sc(?:\.| in \w+)?|BE|BEng|BA|MFA)\b/i);
    if (match) return match[0];
  }

  // Master's
  if (line.match(/\b(?:Master|M\.Sc|ME|MEng|MA|MBA)\b/i)) {
    const match = line.match(/\b(?:Master(?:'s)?(?: of \w+)?|M\.Sc(?:\.| in \w+)?|ME|MEng|MA|MBA)\b/i);
    if (match) return match[0];
  }

  // PhD
  if (line.match(/\b(?:Ph\.?D\.?|Doctor(?:ate)?(?: of Philosophy)?)\b/i)) {
    const match = line.match(/\b(?:Ph\.?D\.?|Doctor(?:ate)?(?: of Philosophy)?)\b/i);
    if (match) return match[0];
  }

  return null;
}

/**
 * Extract year from a line of text
 */
function extractYear(line: string): string | null {
  // Year range
  const yearRangePattern = /(\d{4})\s*[-–—]\s*(\d{4}|Present)/;
  const yearRangeMatch = line.match(yearRangePattern);
  if (yearRangeMatch) {
    return `${yearRangeMatch[1]} – ${yearRangeMatch[2]}`;
  }

  // Single year
  const singleYearPattern = /\b(19|20)\d{2}\b/;
  const singleYearMatch = line.match(singleYearPattern);
  if (singleYearMatch) {
    return singleYearMatch[0];
  }

  // Month Year format
  const monthYearPattern = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i;
  const monthYearMatch = line.match(monthYearPattern);
  if (monthYearMatch) {
    return monthYearMatch[1];
  }

  return null;
}

/**
 * Extract field of study from a line of text
 */
function extractFieldOfStudy(line: string): string | null {
  // Look for "in [Field]" pattern
  const fieldPattern = /\b(in|of)\s+([A-Za-z][A-Za-z\s]+?)(?=\s*(?:,|\.|$))/i;
  const match = line.match(fieldPattern);
  if (match) {
    return match[2].trim();
  }

  return null;
}

/**
 * Main orchestrator function to structure CV profile from raw text
 */
export function structureCvProfile(text: string, sourceCvS3Key: string): CvProfile {
  // Validate input
  if (!text || text.trim().length === 0) {
    throw new Error('CV text is empty or invalid');
  }

  if (!sourceCvS3Key || sourceCvS3Key.trim().length === 0) {
    throw new Error('sourceCvS3Key is required');
  }

  // Extract all components
  const { fullName, summary } = extractNameAndSummary(text);
  const skills = extractSkills(text);
  const experience = extractExperience(text);
  const education = extractEducation(text);

  // Build and return the profile
  const profile: CvProfile = {
    fullName: fullName || undefined,
    summary: summary || undefined,
    skills,
    experience,
    education,
    extractedAt: new Date().toISOString(),
    sourceCvS3Key,
  };

  return profile;
}