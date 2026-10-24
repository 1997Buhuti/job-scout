# Feature: CV Structured Extract - Tasks

**Feature slug:** `04-cv-structured-extract`  
**Follow:** [01-spec.md](./01-spec.md) - [02-plan.md](./02-plan.md)  
**Protocol:** Execute **one** unchecked task at a time; wait for confirmation; then mark `[x]`.

> **Revision (client-side extraction):** PDF text extraction and structuring move from the
> `parseCvPdf` Lambda to the browser. Phases 1-2 below were completed against the old
> server-side design; the extractor code is **ported** to the frontend (Phase 3) and the
> Lambda is **reworked** into a validate-and-persist endpoint (Phase 4). Old test tasks
> B15-B20 are superseded by the new tasks.
>
> **Frontend note:** this repo's Next.js has breaking changes. Before writing frontend code, read
> the relevant guides in `frontend/node_modules/next/dist/docs/`. Frontend code follows
> `frontend-feature-structure` (domain code under `src/features/cv/`).

---

## Completed before the revision (backend, server-side design)

### Phase 1: Core extraction logic (reused - to be ported in Phase 3)

- [x] **B1.** Add `pdf-parse` dependency to `backend/package.json` *(will be removed in B20)*.
- [x] **B2.** Create `backend/src/modules/cvModule/parseCvPdf/types.ts`: `CvProfile`, `CvExperience`, `CvEducation` matching spec FR-2.
- [x] **B3.** Create `.../parseCvPdf/patterns.ts`: regex patterns for section detection.
- [x] **B4.** Create `.../parseCvPdf/skillDictionary.ts`: curated skill dictionary.
- [x] **B5.** Create `.../parseCvPdf/structureExtraction.ts`: `extractSkills()`.
- [x] **B6.** Enhance `structureExtraction.ts`: `extractExperience()`.
- [x] **B7.** Enhance `structureExtraction.ts`: `extractEducation()`.
- [x] **B8.** Enhance `structureExtraction.ts`: `extractNameAndSummary()`.
- [x] **B9.** Create `structureCvProfile(text, key)` orchestrator.

### Phase 2: Lambda integration (to be reworked in Phase 4)

- [x] **B10.** `handler`/`parseCvPdf.ts`: call `structureCvProfile` after PDF text extraction.
- [x] **B11.** Add DynamoDB `UpdateItem` to persist `cvProfile` with `cvS3Key` and `updatedAt`.
- [x] **B12.** Include `cvProfile` in the 200 response.
- [x] **B13.** Error handling: extraction failure does not fail the upload.
- [x] **B14.** Truncate CV text to 50,000 c hars.

---

## Phase 3: Client-side extraction (frontend)

- [x] **C1.** Spike - confirm PDF text extraction works in this Next.js app. *Done with `pdf-parse@^2.4.5` (web build of pdf.js via its `browser` export) instead of `pdfjs-dist`.* Worker is copied to `public/pdf.worker.mjs` by `frontend/scripts/copy-pdf-worker.mjs` (`predev`/`prebuild`). `next build --webpack` and the default Turbopack build both succeed; text extraction verified on a generated PDF in Node. **Still to verify manually in a real browser (`npm run dev`, upload a PDF, confirm `/pdf.worker.mjs` loads).**
- [x] **C2.** Create `frontend/src/features/cv/types/cvProfile.ts`: `CvProfile`, `CvExperience`, `CvEducation`.
- [x] **C3.** Create `patterns.ts`, `skillDictionary.ts`, `structureExtraction.ts` in `frontend/src/features/cv/utils/`. *Rewritten rather than copied*: the backend versions had broken section-header regexes (literal spaces) and substring dictionary matching that produced false-positive skills. Backend copies are not deleted yet (B20).
- [x] **C4.** Unit tests for the extractor in `frontend/src/features/cv/utils/__tests__/structureExtraction.test.ts` using the **existing Jest setup** (no Vitest); added `npm test` script to `frontend/package.json`.
- [x] **C5.** Create `frontend/src/features/cv/utils/extractPdfText.ts`: lazy `await import('pdf-parse')`, `lineEnforce` line reconstruction, 10-page / 50,000-char / 15 s limits, always `destroy()`, typed errors (`EmptyPdfTextError`, `PdfReadError`).
- [x] **C6.** Unit tests for `extractPdfText` with a mocked `pdf-parse` (`__tests__/extractPdfText.test.ts`).
- [x] **C7.** Create `frontend/src/features/cv/api/processCvUpload.ts` (presign -> S3 PUT in parallel with extract+structure -> `POST /cv/parse`); extraction failures never block the upload; an empty profile is not sent. Tests in `api/__tests__/processCvUpload.test.ts`.
- [x] **C8.** Update `frontend/src/lib/api/cvService.ts`: `ParsedCvResult` is `{ key; cvProfile? }`, `parseCvPdf` replaced by `saveParsedCv(key, cvProfile?)`, `uploadAndParseCv` removed.
---

## Phase 4: Backend rework (validate and persist only)

- [x] **B15.** `types.ts`: `ParseCvRequest = { key; cvProfile?: unknown }`; `ParseCvResult = { key }`. *The API now answers `204 No Content` (nothing to return - the browser already has the data).*
- [x] **B16.** `validateCvProfile.ts` with `sanitizeCvProfile` (object/array checks -> 400, known fields only, trimmed, control chars stripped, skills deduped, all caps, server-set `extractedAt`/`sourceCvS3Key`) and `_tests/validateCvProfile.test.ts`.
- [x] **B17.** Reworked `parseCvPdf.ts`: no S3, no PDF parsing, no debug logs; auth + `cvs/{userId}/` prefix check, 64 KB body guard, sanitize, `UpdateItem` (`cvProfile` only when supplied, so a previous one is kept; optional fields omitted rather than stored as NULL). Handler returns 204.
- [x] **B18.** Rewrote `_tests/parseCvPdf.test.ts` for the new contract (persisted map shape, forged server fields ignored, pointer-only save, 403/400 cases, DynamoDB failure surfaced). Backend `npm test`, `compile`, `lint` pass.
- [x] **B19.** Removed `CV_BUCKET_NAME` from the `parseCvPdf` function env. Decision: a DynamoDB write failure now throws `DatabaseError` (500) instead of being logged and swallowed, so the client never sees success for an unsaved CV.
- [x] **B20.** Deleted backend `structureExtraction.ts`, `patterns.ts`, `skillDictionary.ts` and `__tests__/structureExtraction.test.ts`; removed `pdf-parse` from `backend/package.json` and the lockfile.
- [x] **B21.** Manual smoke test: deploy backend to `dev`; verify with a real PDF through the UI that `POST /cv/parse` receives a populated `cvProfile`, DynamoDB stores it, and CloudWatch has no `DOMMatrix`/pdf-parse errors. Verify a scanned PDF still uploads and keeps the previous `cvProfile`.

---

## Database schema update

- [ ] **D1.** Update `specs/02-database-schema.md`: Document `cvProfile?: CvProfile` optional attribute on `UserProfile` with inline type definitions.
- [ ] **D2.** Verify DynamoDB table schema allows the optional nested map attribute (no migration needed; test write/read with sample `cvProfile` JSON).

---

## Phase 5: Profile UI

- [x] **U1.** Create `frontend/src/features/profile/components/SkillsSection.tsx`: skills display component with chips, add/remove functionality, editing state.
- [x] **U2.** Update the profile page (e.g. `frontend/src/app/(dashboard)/...`): fetch the user profile including `cvProfile`; pass to `SkillsSection`.
- [x] **U3.** Implement `SkillsSection`: display `cvProfile.skills` as editable chips; allow adding a custom skill (input + button) and removing skills (chip delete icon).
- [x] **U4.** Implement save flow: on "Save Profile", `PUT /profile` with updated `cvProfile.skills` merged with existing profile data; show success/error feedback. Confirm the backend `updateProfile` accepts `cvProfile` (update it and its tests if not).
- [x] **U5.** (Optional MVP) Read-only display for `cvProfile.experience` and `cvProfile.education`.

### Dropzone feedback

- [x] **U6.** Update `CvUploadCard` / `CvUploadDropzone` to use `processCvUpload`; `CvUploadResult` carries `skillsCount` (replacing `charCount`). Success: "Extracted N skills from your CV". When no `cvProfile` was produced: "CV uploaded, but we couldn't read its text. You can add your skills manually."
- [x] **U7.** Add navigation link: after a successful upload show a "View Profile" button/link to the page where skills are editable.

---

## Documentation & validation

- [ ] **V1.** Document the skill dictionary update process (how to add new skills; requires frontend deploy) and the pdfjs worker setup found in C1.
- [ ] **V2.** Prepare 5-10 sample CVs (varied formats, well- and poorly-formatted, plus one scanned PDF): test extraction in the browser; document results (target >=70% accuracy for well-formatted CVs).
- [ ] **V3.** Cross-check acceptance criteria AC-1 through AC-12 from `01-spec.md` in the `dev` environment.
- [ ] **V4.** Security validation: users cannot write to another user's prefix/profile (test with different Cognito tokens); hand-crafted requests with oversized or unknown `cvProfile` fields are sanitized or rejected; no CV text/PII in CloudWatch or browser console logs.

---

## Definition of done

All tasks above are `[x]`, and:
- Selecting a text PDF in the UI produces a `cvProfile` in the browser and `POST /cv/parse` persists it
- `UserProfile.cvProfile` is stored in DynamoDB after server-side validation
- The `parseCvPdf` Lambda does no PDF parsing and has no `pdf-parse` dependency
- Scanned/unreadable PDFs still upload and do not wipe an existing `cvProfile`
- Profile UI displays editable skills chips
- User can add/remove skills and save changes via `PUT /profile`
- No AI API costs incurred
- Acceptance criteria AC-1 through AC-12 are satisfied
- No `.cursorrules` guardrails violated
