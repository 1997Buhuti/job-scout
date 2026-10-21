# Feature: CV Structured Extract — Spec (What & Why)

**Feature slug:** `04-cv-structured-extract`  
**App:** Job Scout  
**Depends on:** [../01-cv-upload/01-spec.md](../01-cv-upload/01-spec.md) (PDF in S3 + plain-text parse + `cvS3Key`)  
**Related schema:** [../../02-database-schema.md](../../02-database-schema.md) (`UserProfile`)  
**UI consumer:** Profile / CV settings — prefill editable skills (and related fields)

---

## Problem / context

`01-cv-upload` stores the PDF and can return raw extracted text, but the UI cannot usefully prefill **skills**, **experience**, and similar fields from a blob of prose. Matching and profile UX need a **small, structured JSON profile** derived from the CV.

Using a PDF parser library with pattern matching and NLP techniques provides a cost-effective solution without per-upload AI costs, especially for MVP where we expect ~50-100 CV uploads during the $50 budget period.

---

## Goals

1. After a CV PDF is uploaded and plain text is available, produce a **structured `CvProfile` JSON** (skills, experience, education, summary, optional identity fields).
2. Persist that profile so the UI can load and edit it without re-processing on every page view.
3. Prefill profile UI (especially **skills chips**) from the latest extract; user may correct before save.
4. Keep processing cost minimal: **PDF parsing + pattern matching only**, no AI costs per CV.

---

## Functional requirements

### FR-1 — Trigger

- Structured extract runs **after** successful PDF text extraction for an authenticated user (integrated into `POST /cv/parse` flow or as immediate follow-up).
- Input is the plain CV text from `parseCvPdf`. Caller may only operate on their own prefix / profile.
- Unauthenticated requests are rejected (`401`). Wrong key prefix ? `403`.

### FR-2 — `CvProfile` JSON shape (MVP)

The parser must return JSON conforming to:

```typescript
export interface CvExperience {
  title: string;
  company: string;
  /** Free-form period if dates are unclear, e.g. "2021 – Present" */
  period?: string;
  summary?: string;
}

export interface CvEducation {
  institution: string;
  degree?: string;
  field?: string;
  /** Graduation year or period string */
  year?: string;
}

export interface CvProfile {
  /** Best-effort full name from the CV */
  fullName?: string;
  /** Short professional summary if present */
  summary?: string;
  /** Normalized skill labels (deduped, trimmed, case-normalized) */
  skills: string[];
  experience: CvExperience[];
  education: CvEducation[];
  /** ISO-8601 when this extract was produced */
  extractedAt: string;
  /** S3 key of the PDF this extract was derived from */
  sourceCvS3Key: string;
}
```

**MVP caps (reject or truncate in validation):**

| Field | Cap |
| --- | --- |
| `skills` | max **40** items; each max **48** chars |
| `experience` | max **15** entries |
| `education` | max **10** entries |
| `summary` / experience `summary` | max **500** chars each |
| Free-text string fields | trim; drop empty strings |

Missing sections ? empty arrays / omitted optionals. Do not invent employers or degrees that are not in the CV text; prefer omit over guess.

### FR-3 — Extraction approach (PDF parser + pattern matching)

**Libraries:**
- **PDF parsing:** Use `pdf-parse` or `pdfjs-dist` for text extraction (already integrated in `parseCvPdf`)
- **NLP/Pattern matching:** Use regex patterns, keyword matching, and section detection for structured extraction
- **Skills detection:** Maintain a curated skill dictionary (common tech skills, soft skills) for fuzzy matching

**Extraction strategy:**
1. **Section detection:** Identify CV sections using common headers (Experience, Education, Skills, Summary, etc.)
2. **Skills extraction:**
   - Look for explicit "Skills" section
   - Match against curated skill dictionary using case-insensitive fuzzy matching
   - Extract from bullet points and experience descriptions
   - Deduplicate and normalize (e.g., "JavaScript", "javascript", "JS" ? "JavaScript")
3. **Experience extraction:**
   - Pattern match job titles, company names, date ranges
   - Extract from sections labeled "Experience", "Work History", "Employment", etc.
   - Parse date patterns (MM/YYYY, Month YYYY, YYYY-YYYY, etc.)
4. **Education extraction:**
   - Detect degree types (B.Sc., M.Sc., PhD, Bachelor's, Master's, etc.)
   - Extract institution names and graduation years
5. **Name/Summary extraction:**
   - Extract name from top of document or explicit "Name:" field
   - Extract professional summary from intro sections

**Cost:** $0 (only Lambda compute time, no AI API costs)

### FR-4 — Persistence

- On success, persist `CvProfile` on `UserProfile` in DynamoDB as a JSON attribute `cvProfile` (map / document).
- Always keep `UserProfile.cvS3Key` as the PDF pointer from `01-cv-upload`.
- Replacing a CV and re-running extract **overwrites** the previous structured profile for that user.

### FR-5 — Profile / UI consumption

- After extract, API response includes `{ cvProfile }` (or the full profile including `cvProfile`) so the dropzone flow can show success and prefilled skills.
- Profile / settings UI shows **editable skills chips** (and may show experience/education read-only or editable in MVP — minimum is skills editable).
- User edits are saved via an authenticated profile update path; client must not be able to set `userId` or forge another user's extract.
- Saving user-edited skills must **not** require re-parsing.

### FR-6 — Failure behavior

- If parsing fails or returns empty/unparseable text: return a clear error (`422`); **do not** wipe a previous good `cvProfile`.
- If PDF text was empty, skip structured extraction (`422`).
- Truncate overly long CV text before parsing (e.g., max 50,000 chars) to protect Lambda memory/timeout.

### FR-7 — Skill dictionary (MVP)

Maintain a curated list of ~200-500 common skills for matching:
- **Tech skills:** JavaScript, TypeScript, Python, AWS, Docker, React, Node.js, etc.
- **Soft skills:** Leadership, Communication, Problem Solving, etc.
- **Domains:** Machine Learning, DevOps, Frontend, Backend, etc.

Dictionary should be:
- Stored as a JSON file in the Lambda bundle or S3
- Case-insensitive for matching
- Include common variations (e.g., "JS" ? "JavaScript", "AWS Lambda" ? "Lambda")
- Updatable without code deployment (optional: fetch from S3 on cold start)

---

## Non-goals

- OCR for image-only / scanned PDFs (may be added later with Textract).
- Parsing `.docx` or other non-PDF formats.
- AI-powered extraction with Bedrock or other AI services in MVP.
- Full ATS résumé graph, certifications taxonomy, or LinkedIn import.
- Auto-writing cover letters or rewriting the CV.
- Real-time skill trend analysis or job market matching.

---

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | After a successful CV text parse for a text PDF, the system produces a valid `CvProfile` JSON including `skills` (array), `experience`, `education`, `extractedAt`, and `sourceCvS3Key`. |
| AC-2 | Structured extract uses **only** PDF parsing libraries and pattern matching (no AI API costs). |
| AC-3 | At most **one** parsing pass occurs per successful parse/re-parse of a CV. |
| AC-4 | Persisted `cvProfile` attribute on `UserProfile` is returned on a subsequent authenticated profile read without re-parsing. |
| AC-5 | Profile UI can display prefilled **skills chips** from `cvProfile`; user can edit and save skills without re-parsing. |
| AC-6 | Unauthenticated extract/read/update is `401`; users cannot extract or overwrite another user's CV prefix / profile. |
| AC-7 | Invalid / empty PDF text does not crash; malformed parser output does not leave the API returning unchecked raw text as if it were `CvProfile`. |
| AC-8 | No third-party AI/upload services; AWS SDK v3 only. |
| AC-9 | Skills are normalized and deduplicated (e.g., "javascript", "JavaScript", "JS" all become "JavaScript"). |
| AC-10 | Common CV section patterns are correctly identified (Experience, Education, Skills, Summary) with reasonable accuracy (=70% for well-formatted CVs in manual testing). |

---

## Constraints

- **AWS only:** Lambda, API Gateway, Cognito, S3, DynamoDB.
- **SDK:** AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/lib-dynamodb`). Never `aws-sdk` v2.
- **Runtime:** Node.js 20.x, Serverless Framework v3.
- **Region:** `us-east-1`.
- **Budget:** Prefer short Lambda execution time, modest memory (512-1024 MB), simple regex/pattern matching over complex NLP libraries.
- **Libraries:** Prefer lightweight, zero-dependency parsers where possible. If using heavy NLP libraries, justify in plan.

---

## Open decisions (resolve in `02-plan.md`)

1. Inline extract inside `parseCvPdf` vs dedicated handler/function.
2. Skill dictionary: bundled JSON vs S3 fetch vs hardcoded array.
3. Whether MVP UI edits only `skills` or also experience/education.
4. Pattern matching complexity: simple regex vs lightweight NLP library (e.g., compromise, natural).
5. Whether failed extract keeps the previous `cvProfile` or clears it (recommend: keep previous on failure).

