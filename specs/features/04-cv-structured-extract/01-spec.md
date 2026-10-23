# Feature: CV Structured Extract - Spec (What & Why)

**Feature slug:** `04-cv-structured-extract`  
**App:** Job Scout  
**Depends on:** [../01-cv-upload/01-spec.md](../01-cv-upload/01-spec.md) (PDF in S3 via presigned URL + `cvS3Key`)  
**Related schema:** [../../02-database-schema.md](../../02-database-schema.md) (`UserProfile`)  
**UI consumer:** Profile / CV settings - prefill editable skills (and related fields)

> **Revision (client-side extraction):** PDF text extraction and structuring now run
> **in the browser**. The API no longer parses PDFs; it receives a structured
> `CvProfile`, validates/sanitizes it, and persists it. Reason: `pdf-parse` v2 (pdfjs)
> needs `DOMMatrix` / `ImageData` / `Path2D` (native `@napi-rs/canvas`), which are not
> available in the bundled Lambda, so server-side parsing fell back to regex over
> compressed PDF bytes and produced garbage. Browsers provide these globals natively.

---

## Problem / context

`01-cv-upload` stores the PDF in S3, but the UI cannot usefully prefill **skills**, **experience**, and similar fields from a PDF blob. Matching and profile UX need a **small, structured JSON profile** derived from the CV.

Parsing the PDF in the browser with a PDF library plus pattern matching is a cost-effective solution: no per-upload AI costs, no PDF-parsing runtime on Lambda, and ~50-100 CV uploads expected during the $50 budget period.

---

## Goals

1. When a user selects a CV PDF, the **browser** extracts the plain text and produces a **structured `CvProfile` JSON** (skills, experience, education, summary, optional identity fields).
2. The browser sends that `CvProfile` to the API, which **validates and persists** it so the UI can load and edit it without re-processing on every page view.
3. Prefill profile UI (especially **skills chips**) from the latest extract; user may correct before save.
4. Keep processing cost minimal: **client-side PDF parsing + pattern matching only**, no AI costs per CV, no PDF parsing on Lambda.

---

## Functional requirements

### FR-1 - Trigger

- Structured extract runs **in the browser during the CV upload flow**, on the PDF file the user selected (presign -> S3 upload -> client extract -> `POST /cv/parse`).
- The API call carries the S3 `key` and the client-produced `cvProfile`. Caller may only operate on their own `cvs/{userId}/` prefix / profile.
- Unauthenticated requests are rejected (`401`). Wrong key prefix -> `403`.

### FR-2 - `CvProfile` JSON shape (MVP)

The extractor must return JSON conforming to:

```typescript
export interface CvExperience {
  title: string;
  company: string;
  /** Free-form period if dates are unclear, e.g. "2021 - Present" */
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

**MVP caps (enforced by the client extractor AND re-enforced by the API; the API truncates/drops, it does not trust the client):**

| Field | Cap |
| --- | --- |
| `skills` | max **40** items; each max **48** chars |
| `experience` | max **15** entries |
| `education` | max **10** entries |
| `summary` / experience `summary` | max **500** chars each |
| Free-text string fields | trim; drop empty strings |

Missing sections -> empty arrays / omitted optionals. Do not invent employers or degrees that are not in the CV text; prefer omit over guess.

### FR-3 - Extraction approach (browser PDF parser + pattern matching)

**Libraries:**
- **PDF text extraction (browser):** `pdf-parse` v2 web build (pdf.js), loaded lazily (dynamic import, client-only) so it is not part of the initial bundle and never runs during SSR.
- **Pattern matching:** regex patterns, keyword matching, and section detection for structured extraction (plain TypeScript, no NLP library).
- **Skills detection:** a curated skill dictionary (common tech skills, soft skills) bundled with the frontend.

**Extraction strategy:**
1. **Text extraction:** read the PDF in the browser, reconstruct line breaks from pdfjs text items (end-of-line flags / y-position changes) so section headings stay on their own lines.
2. **Section detection:** identify CV sections using common headers (Experience, Education, Skills, Summary, etc.)
3. **Skills extraction:**
   - Look for explicit "Skills" section
   - Match against curated skill dictionary using case-insensitive matching on word boundaries
   - Extract from bullet points and experience descriptions
   - Deduplicate and normalize (e.g., "JavaScript", "javascript", "JS" -> "JavaScript")
4. **Experience extraction:**
   - Pattern match job titles, company names, date ranges
   - Extract from sections labeled "Experience", "Work History", "Employment", etc.
   - Parse date patterns (MM/YYYY, Month YYYY, YYYY-YYYY, etc.)
5. **Education extraction:**
   - Detect degree types (B.Sc., M.Sc., PhD, Bachelor's, Master's, etc.)
   - Extract institution names and graduation years
6. **Name/Summary extraction:**
   - Extract name from top of document or explicit "Name:" field
   - Extract professional summary from intro sections

**Cost:** $0 (browser compute only, no AI API costs, no Lambda PDF parsing)

### FR-4 - Persistence

- The API validates and sanitizes the incoming `cvProfile` (types, caps, unknown fields dropped), then persists it on `UserProfile` in DynamoDB as a JSON attribute `cvProfile` (map / document).
- The **server** sets `extractedAt` (server time) and `sourceCvS3Key` (the validated request `key`); client-provided values for these two fields are ignored.
- Always keep `UserProfile.cvS3Key` as the PDF pointer from `01-cv-upload`.
- Replacing a CV and re-running extract **overwrites** the previous structured profile for that user.

### FR-5 - Profile / UI consumption

- The API answers `204 No Content` once the profile is saved. The dropzone flow shows success and the number of extracted skills from the profile the browser already holds.
- Profile / settings UI shows **editable skills chips** (and may show experience/education read-only or editable in MVP - minimum is skills editable).
- User edits are saved via an authenticated profile update path; client must not be able to set `userId` or write another user's profile.
- Saving user-edited skills must **not** require re-parsing.

### FR-6 - Failure behavior

- **Client-side extraction failure** (empty text from a scanned/image PDF, pdfjs error, timeout): the upload still completes. The client calls `POST /cv/parse` with only `{ key }`; the API persists `cvS3Key` and **keeps the previous `cvProfile`** untouched. The UI tells the user the CV could not be read and invites them to add skills manually.
- **Malformed `cvProfile` sent to the API** (wrong types, not an object): reject with `400`; do not write anything and do not wipe a previous good `cvProfile`.
- Truncate overly long CV text in the browser before structuring (max 50,000 chars); the API additionally caps the request body size and field sizes (FR-2 caps).

### FR-7 - Skill dictionary (MVP)

Maintain a curated list of ~200-500 common skills for matching:
- **Tech skills:** JavaScript, TypeScript, Python, AWS, Docker, React, Node.js, etc.
- **Soft skills:** Leadership, Communication, Problem Solving, etc.
- **Domains:** Machine Learning, DevOps, Frontend, Backend, etc.

Dictionary should be:
- A TypeScript module bundled with the frontend (lazy-loaded with the extractor)
- Case-insensitive for matching
- Include common variations (e.g., "JS" -> "JavaScript", "AWS Lambda" -> "Lambda")
- Updating it requires a frontend deploy (acceptable for MVP)

---

## Non-goals

- Server-side PDF parsing on Lambda (removed; see revision note).
- OCR for image-only / scanned PDFs (may be added later with Textract).
- Parsing `.docx` or other non-PDF formats.
- AI-powered extraction with Bedrock or other AI services in MVP.
- Re-parsing a stored CV from S3 server-side (a future background job could do this; out of MVP scope).
- Full ATS resume graph, certifications taxonomy, or LinkedIn import.
- Auto-writing cover letters or rewriting the CV.
- Real-time skill trend analysis or job market matching.

---

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | After selecting a text PDF in the UI, the browser produces a valid `CvProfile` JSON including `skills` (array), `experience`, `education`, `extractedAt`, and `sourceCvS3Key`, and the API persists it. |
| AC-2 | Structured extract uses **only** a PDF parsing library and pattern matching (no AI API costs). |
| AC-3 | At most **one** parsing pass occurs per CV upload. |
| AC-4 | Persisted `cvProfile` attribute on `UserProfile` is returned on a subsequent authenticated profile read without re-parsing. |
| AC-5 | Profile UI can display prefilled **skills chips** from `cvProfile`; user can edit and save skills without re-parsing. |
| AC-6 | Unauthenticated extract/read/update is `401`; users cannot write to another user's CV prefix / profile. |
| AC-7 | Empty or unreadable PDFs do not crash the UI and do not block the upload; `cvS3Key` is saved and any previous `cvProfile` is kept. A malformed `cvProfile` is rejected by the API with `400` and never stored unchecked. |
| AC-8 | No third-party AI/upload services; AWS SDK v3 only. |
| AC-9 | Skills are normalized and deduplicated (e.g., "javascript", "JavaScript", "JS" all become "JavaScript"). |
| AC-10 | Common CV section patterns are correctly identified (Experience, Education, Skills, Summary) with reasonable accuracy (>=70% for well-formatted CVs in manual testing). |
| AC-11 | The API treats the client-supplied `cvProfile` as untrusted: caps are re-enforced server-side, unknown fields are dropped, and `extractedAt` / `sourceCvS3Key` are set by the server. |
| AC-12 | The `parseCvPdf` Lambda performs no PDF parsing and no longer depends on `pdf-parse` / `pdfjs`; CloudWatch shows no `DOMMatrix` errors. |

---

## Constraints

- **AWS only:** Lambda, API Gateway, Cognito, S3, DynamoDB.
- **SDK:** AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/lib-dynamodb`). Never `aws-sdk` v2.
- **Runtime:** Node.js 24.x on Lambda, Serverless Framework v4 (as configured in `backend/serverless.ts`).
- **Region:** `us-east-1`.
- **Frontend:** follows `frontend-feature-structure` (domain code under `src/features/cv/`; `lib/` only for API/AWS wrappers). Next.js in this repo has breaking changes vs. older versions - read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing frontend code.
- **Bundle size:** `pdf-parse` must be loaded lazily (only when a CV is selected) and only on the client.
- **Budget:** Prefer simple regex/pattern matching over complex NLP libraries.

---

## Open decisions (resolve in `02-plan.md`)

1. Skill dictionary location: frontend bundled TS module (resolved in plan).
2. Whether MVP UI edits only `skills` or also experience/education.
3. Pattern matching complexity: simple regex vs lightweight NLP library (resolved: simple regex).
4. Failed extract keeps the previous `cvProfile` (resolved: keep).
5. API contract: keep `POST /cv/parse` route with a new body, or add a new route (resolved in plan).
