# Feature: CV Structured Extract - Plan (How)

**Feature slug:** `04-cv-structured-extract`  
**Implements:** [01-spec.md](./01-spec.md)  
**Stack:** Serverless Framework v4 - Node.js 24.x - AWS SDK v3 - Next.js App Router - Amplify Gen 2 - `us-east-1`

> **Revision (client-side extraction):** extraction moved from the `parseCvPdf` Lambda to the
> browser. Root cause of the change: `pdf-parse` v2 (pdfjs) throws `DOMMatrix is not defined`
> in the bundled Lambda (its `@napi-rs/canvas` polyfill is a native module that is not
> shipped), and the regex fallback then produced binary garbage that was persisted as a CV.

---

## Architecture overview

```text
Browser (Profile page, CvUploadDropzone)
  1. POST /cv/presign                      -> { uploadUrl, key }
  2. in parallel:
       a. PUT file -> S3 (presigned URL)
       b. pdf-parse (web build): PDF -> text (lazy import, client only)
          structureCvProfile(text, key)    -> CvProfile   (regex + dictionary)
          (on failure: cvProfile = undefined, upload still succeeds)
  3. POST /cv/parse  { key, cvProfile? }   (Cognito JWT) -> 204 No Content
        |
        v
Lambda: parseCvPdf  (no PDF parsing any more)
  - Verify JWT, key prefix cvs/{userId}/
  - Sanitize cvProfile (types, caps, drop unknown fields)
  - Set extractedAt (server time) + sourceCvS3Key (= key)
  - UpdateItem UserProfile: cvS3Key, updatedAt, [cvProfile]
  - Return 204 No Content (the browser already has the data)
        |
        v
DynamoDB: UserProfile.cvProfile
        |
        v
Frontend: Profile UI -> skills chips (edit) -> PUT /profile
```

**Decisions:**

- Extraction + structuring run in the browser; the API only validates and persists.
- Keep the existing `POST /cv/parse` route and `parseCvPdf` Lambda name to avoid infra churn. The request body changes from `{ key }` to `{ key, cvProfile? }`. Renaming the route/function to something like `saveCvProfile` is optional later cleanup.
- The client-sent `cvProfile` is **untrusted input**: the API re-validates everything.
- Client extraction failure never blocks the upload (FR-6).

---

## Frontend - extraction (new)

### Module structure (per `frontend-feature-structure`)

```text
frontend/src/features/cv/
+-- types/
|   +-- cvProfile.ts            (CvProfile, CvExperience, CvEducation)
+-- utils/
|   +-- extractPdfText.ts       (File -> text via pdf-parse web build, client only)
|   +-- structureExtraction.ts  (text -> CvProfile)
|   +-- patterns.ts             (section headings, dates, degrees)
|   +-- skillDictionary.ts      (curated dictionary; port)
|   +-- __tests__/ ...          (ported + new tests)
+-- api/
    +-- processCvUpload.ts      (orchestrates presign, S3 PUT, extract, save)
```

`src/lib/api/cvService.ts` keeps the low-level HTTP calls (presign, S3 PUT, `POST /cv/parse`). Orchestration lives in `features/cv/api/` so `lib/` has no runtime dependency on `features/` (it only imports the `CvProfile` type, erased at compile time).

`structureExtraction.ts`, `patterns.ts`, `skillDictionary.ts` also exist in `backend/src/modules/cvModule/parseCvPdf/`. They were **rewritten, not copied**, because the backend versions had defects that made extraction return almost nothing on real CVs: section-header regexes contained literal spaces (so "Skills"/"Experience"/"Education" were never found, hence `experience: 0, education: 0` in production), and the dictionary used substring matching with tiny aliases (`c`, `go`, `r`, `js`, `es`, `pm`...), so random bytes produced "skills". The frontend versions use line-based section detection, word-boundary matching, case-sensitive/"weak" handling for ambiguous terms, and a cleaner dictionary. The backend copies are **deleted** after the Lambda rework (B20) so there is a single source of truth.

### `extractPdfText.ts`

- **Library (implemented):** `pdf-parse@^2.4.5` in `frontend/package.json`. Its `exports` map has a `browser` condition that resolves to a web build (`dist/pdf-parse/web/pdf-parse.es.js`, bundled pdf.js, no native canvas), which Next.js picks for client bundles. Verified with both `next build --webpack` (used by Amplify) and the default Turbopack build. The Node-only `@napi-rs/canvas` references in that chunk are behind pdf.js's `isNodeJS` guard.
- **Client only.** `pdf-parse` is imported with `await import('pdf-parse')` inside `extractPdfText` (never at module top level): it is a separate lazy chunk (~460 KB) and never runs during SSR/prerender.
- **Worker:** pdf-parse's web build needs `PDFParse.setWorker(url)`. `pdf-parse` does not export the worker file, so `frontend/scripts/copy-pdf-worker.mjs` copies `pdf.worker.mjs` from `node_modules` to `frontend/public/pdf.worker.mjs` (git-ignored) in the `predev` / `prebuild` npm scripts; the app uses `PDF_WORKER_URL = '/pdf.worker.mjs'`. Same-origin, works with webpack and Turbopack, no CDN.
- **Line reconstruction:** `getText({ lineEnforce: true, cellSeparator: ' ', pageJoiner: '' })` makes pdf-parse rebuild lines from text-item positions (so headings stay on their own lines), join same-line cells with a space, and omit its `-- n of m --` page markers. Pages are joined with a blank line, then `normalizeCvText` runs.
- **Limits:** first 10 pages only, 50,000 chars, 15 s timeout; `destroy()` is always called.
- Returns the text, or throws a typed error (`EmptyPdfTextError`, `PdfReadError`) for the orchestrator to turn into "no cvProfile".

### `processCvUpload.ts` (orchestrator)

```typescript
export async function processCvUpload(file: File): Promise<{ key: string; cvProfile?: CvProfile }> {
  const { uploadUrl, key } = await requestCvPresign();

  const [, cvProfile] = await Promise.all([
    uploadCvToS3(uploadUrl, file),       // failure here fails the whole upload
    extractProfile(file, key),           // never throws; returns undefined on failure
  ]);

  return saveParsedCv(key, cvProfile);   // POST /cv/parse { key, cvProfile? }
}
```

`extractProfile` = `extractPdfText` -> `structureCvProfile(text, key)` wrapped in try/catch; logs a console warning (no CV text in logs) and returns `undefined` on any failure.

### `cvService.ts` changes

- `ParsedCvResult` becomes `{ key: string; cvProfile?: CvProfile }` (no `text`/`charCount`).
- `parseCvPdf(key)` is replaced by `saveParsedCv(key, cvProfile?)` sending `{ key, cvProfile }`.
- `uploadAndParseCv` is removed in favor of `processCvUpload`.

---

## Structured extraction algorithm (unchanged logic, now in the browser)

Same algorithm as before; implemented in `features/cv/utils/`. Summary:

1. **Section detection** (`patterns.ts`): header regexes for skills / experience / education / summary; split text into sections by heading lines.
2. **Skills** (`structureExtraction.ts`): dictionary match with word boundaries on the whole text; add canonical form; dedupe; cap 40 items, 48 chars each.
3. **Experience:** date-range anchors (MM/YYYY, Month YYYY, YYYY-YYYY, Present); company/title taken near each anchor; cap 15.
4. **Education:** degree patterns (B.Sc., M.Sc., PhD, Bachelor's, Master's, Diploma) plus year and institution; cap 10.
5. **Name/summary:** first short line or `Name:` label; summary section or first paragraph; cap 500 chars.
6. **Orchestrator** `structureCvProfile(text, sourceKey)`: assembles `CvProfile` with `extractedAt` and `sourceCvS3Key`.

**Skill dictionary:** `skillDictionary.ts`, ~200 entries for MVP, bundled as a TS module and loaded together with the extractor (lazy chunk). Expanding it requires a frontend deploy.

---

## Backend - reworked `parseCvPdf`

### What changes

| Step | Before | After |
| --- | --- | --- |
| 1. Auth | JWT + `cvs/{userId}/` prefix | unchanged |
| 2. Download | `GetObject` from S3 | **removed** |
| 3. Extract text | `pdf-parse` + regex fallback | **removed** |
| 4. Structure | `structureCvProfile(text)` on server | **removed** (done in browser) |
| 5. Validate | n/a | **NEW:** `sanitizeCvProfile(input, key)` |
| 6. Persist | `UpdateItem` with `cvS3Key`, `updatedAt`, `cvProfile` | same; `cvProfile` only if provided and valid |
| 7. Response | `{ key, text, charCount, cvProfile }` | `204 No Content` |

### Module structure

```text
backend/src/modules/cvModule/parseCvPdf/
+-- handler.ts              (unchanged orchestrator)
+-- parseCvPdf.ts           (reworked: validate + persist only)
+-- validateCvProfile.ts    (NEW: sanitizeCvProfile)
+-- types.ts                (request: { key, cvProfile? }; response: { key, cvProfile? })
+-- _tests/
    +-- parseCvPdf.test.ts          (updated for new contract)
    +-- validateCvProfile.test.ts   (NEW)
```

Removed after the frontend port is verified: `structureExtraction.ts`, `patterns.ts`, `skillDictionary.ts`, `__tests__/structureExtraction.test.ts`.

### `sanitizeCvProfile(input: unknown, key: string): CvProfile`

- Reject (throw `BadRequestError`) if `input` is not a plain object, or if `skills`/`experience`/`education` are present but not arrays.
- Build a **new** object from known fields only (drops unknown/extra fields).
- Strings: must be `string`, trimmed, empty dropped.
- Enforce FR-2 caps: skills 40 (48 chars each, deduped), experience 15, education 10, summaries 500 chars, `fullName` max 100 chars. Entries missing required strings (`title`/`company`, `institution`) are dropped.
- Set `extractedAt = new Date().toISOString()` and `sourceCvS3Key = key`; ignore client values.
- Request body size: rely on API Gateway limits plus a sane explicit check (e.g. reject bodies over ~64 KB) before parsing.

### DynamoDB write

Same `UpdateItem` as today (already implemented, marshalling `cvProfile` as a map). When `cvProfile` is absent, only `cvS3Key` and `updatedAt` are set, so any previous `cvProfile` is retained (FR-6).

### Dependencies and infra cleanup

- Remove `pdf-parse` from `backend/package.json` (and regenerate the lockfile).
- Remove debug `console.log` statements and the regex fallback from `parseCvPdf.ts`.
- The Lambda no longer reads S3: the `CV_BUCKET_NAME` env var and the `s3:GetObject` IAM statement become unnecessary for this function. Removing IAM permissions is a security-relevant change - make it a separate, explicit step (task B21) and only after confirming nothing else reads CVs.

---

## DynamoDB schema update

### `UserProfile` enhancement

```typescript
export interface UserProfile {
  // ... existing fields
  cvProfile?: CvProfile; // structured CV data (sanitized server-side)
}
```

No schema migration needed - optional attribute (already written by the current handler).

---

## Frontend integration - profile UI

**Skills display:** `frontend/src/features/profile/components/SkillsSection.tsx` - chips from `cvProfile.skills`, add/remove, editing state.

**Save flow:** `PUT /profile` with the edited `cvProfile.skills` merged into the existing profile data.

**Experience/Education (read-only in MVP):** formatted lists; editing deferred.

**Dropzone feedback:** `CvUploadCard` calls `processCvUpload`; `CvUploadResult` carries `skillsCount` (replaces `charCount`). Success message: "Extracted N skills from your CV". If `cvProfile` is undefined: "CV uploaded, but we couldn't read its text. You can add your skills manually." Include a "View Profile" link.

---

## Error handling

| Scenario | Behavior |
| --- | --- |
| Empty text / scanned PDF (client) | No `cvProfile`; upload succeeds; UI shows manual-entry message |
| pdfjs error or timeout (client) | Same as above; warning logged without CV content |
| No sections detected | `CvProfile` with empty arrays; do not fail |
| S3 PUT fails | Upload fails with a retryable error; `POST /cv/parse` is not called |
| Malformed `cvProfile` at API | `400`; nothing written; previous `cvProfile` kept |
| Wrong key prefix at API | `403` |
| DynamoDB write fails | Existing behavior: logged; see note in tasks (decide whether to surface as error) |

**Principle:** Never block CV upload on extraction failure. Prefer partial data over crashing, but never persist unvalidated client data.

---

## Testing strategy

### Frontend unit tests

Runner: the existing **Jest** setup in `frontend/` (`jest.config.js`, ts-jest, jsdom, Testing Library); `npm test` was added to `frontend/package.json`. No Vitest.

1. `structureExtraction.test.ts` (new tests; the extractor was rewritten rather than copied, see below): skills, experience layouts and date formats, education, name/summary, caps, garbage input.
2. `extractPdfText.test.ts`: mocks `pdf-parse`; checks worker setup, page limit/`lineEnforce` options, normalization, truncation, empty text, error wrapping and that the parser is always destroyed.
3. `processCvUpload.test.ts`: mocks `cvService` and the extractor; extraction failure still results in `saveParsedCv(key, undefined)`, S3 failure aborts, no CV content in logs.
4. `CvUploadDropzone.test.tsx`: updated for the `skillsCount` / `profileExtracted` result.

Also verified manually with a real generated PDF through `pdf-parse` (same options as the app): text kept its line structure and `structureCvProfile` produced the expected skills, experience and education. Not yet verified in a real browser (worker loading from `/pdf.worker.mjs`).

### Backend unit tests (Jest, existing)

1. `validateCvProfile.test.ts`: caps, trimming, dedupe, dropped unknown fields, overridden `extractedAt`/`sourceCvS3Key`, rejection of non-object/arrays-of-wrong-type.
2. `parseCvPdf.test.ts` (update): no S3 call; with `cvProfile` -> persisted and returned; without -> only `cvS3Key`/`updatedAt` written; wrong prefix -> 403; malformed -> 400.

### Integration / manual

- Upload a real text PDF through the UI on `dev`; verify `POST /cv/parse` payload contains a populated `cvProfile`, `GET /profile` returns it, and CloudWatch shows no `DOMMatrix` / pdf-parse errors.
- Upload a scanned/image PDF; verify the upload succeeds, no `cvProfile` is written, and the previous one (if any) is retained.
- Try a hand-crafted request with oversized/unknown fields and another user's key prefix; verify sanitization and `403`.
- Test with 5-10 real CVs of varying formats (target >=70% skill extraction accuracy for well-formatted CVs). Also verify in a production build (`next build` + start), not only in dev, since worker/bundler behavior can differ.

---

## Performance & cost estimates

| Resource | MVP estimate (per CV upload) | Cost |
| --- | --- | --- |
| Browser | pdfjs lazy chunk + a few hundred ms of parsing | $0 |
| Lambda execution | 128-512 MB, < 200 ms (validate + write; no S3 download or parsing) | ~$0.000002/upload |
| DynamoDB write | 1 WCU (< 1 KB `cvProfile`) | ~$0.0000013/upload |
| **Total per upload** | | **< $0.00001** |

Compare to Bedrock Nova Micro: ~$0.01-0.02/upload.

---

## Open decisions resolved

| Decision | Choice |
| --- | --- |
| Where extraction runs | **Browser** (`pdf-parse` web build / pdf.js), not Lambda |
| Why not fix `pdf-parse` on Lambda | Needs native `@napi-rs/canvas` (external + Linux binary) or a different library; browser avoids it entirely |
| API contract | Keep `POST /cv/parse`; body `{ key, cvProfile? }` |
| Trust of client data | **Untrusted**; server sanitizes and sets `extractedAt`/`sourceCvS3Key` |
| Skill dictionary storage | **Bundled TS module in frontend** (MVP) |
| UI editing scope | **Skills only** (editable); experience/education read-only |
| Pattern matching library | **Native regex** (no heavy NLP) |
| Failed extract behavior | **Keep previous** `cvProfile`; upload still succeeds |
| Single source of truth for extractor | Frontend only; backend copy deleted after port |

---

## Security & compliance

- User can only write their own `cvProfile` (`userId` from JWT; `cvs/{userId}/` prefix enforced).
- The API never trusts client-provided `cvProfile` structure, size, `extractedAt`, or `sourceCvS3Key`.
- The server does not verify that `cvProfile` matches the PDF in S3 (accepted for MVP: it only affects the caller's own profile). If matching ever uses `cvProfile` across users, revisit with server-side verification.
- No CV text in logs (client or server); log only counts and error names.
- No new IAM permissions; optionally remove `s3:GetObject` from the Lambda role once unused (B21).

---

## Future enhancements (post-MVP)

- Add Textract for scanned/image PDFs (OCR), likely as a server-side path.
- Optional server-side re-extraction job from the stored PDF (needs a Lambda-safe parser such as `unpdf`).
- Use Bedrock for advanced extraction if budget increases.
- Editable experience/education in UI.
- Skill trend analysis and auto-suggestions.
- Support `.docx` format.
- Skill dictionary served from S3/admin panel.
- Rename `POST /cv/parse` / `parseCvPdf` to reflect the new responsibility.
