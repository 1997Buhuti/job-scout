# Feature: CV Structured Extract � Tasks

**Feature slug:** `04-cv-structured-extract`  
**Follow:** [01-spec.md](./01-spec.md) � [02-plan.md](./02-plan.md)  
**Protocol:** Execute **one** unchecked task at a time; wait for confirmation; then mark `[x]`.

---

## Backend implementation

### Phase 1: Core extraction logic

- [x] **B1.** Add `pdf-parse` dependency to `backend/package.json` if not already present (check existing deps first).
- [x] **B2.** Create `backend/src/modules/cvModule/parseCvPdf/types.ts`: Define TypeScript interfaces for `CvProfile`, `CvExperience`, `CvEducation` matching spec FR-2.
- [x] **B3.** Create `backend/src/modules/cvModule/parseCvPdf/patterns.ts`: Define regex patterns for section detection (skills, experience, education, summary).
- [x] **B4.** Create `backend/src/modules/cvModule/parseCvPdf/skillDictionary.ts`: Implement curated skill dictionary with ~200 common tech/soft skills (canonical form + variations). Include: JavaScript/TypeScript/Python/AWS/React/Node.js/Docker/K8s and Sri Lankan job market relevant skills.
- [x] **B5.** Create `backend/src/modules/cvModule/parseCvPdf/structureExtraction.ts`: Implement `extractSkills()` function with dictionary matching, normalization, deduplication, capping at 40 skills/48 chars each.
- [x] **B6.** Enhance `structureExtraction.ts`: Implement `extractExperience()` function with date pattern matching, company/title extraction, capping at 15 entries.
- [x] **B7.** Enhance `structureExtraction.ts`: Implement `extractEducation()` function with degree pattern matching, institution extraction, capping at 10 entries.
- [x] **B8.** Enhance `structureExtraction.ts`: Implement `extractNameAndSummary()` function, cap summary at 500 chars.
- [x] **B9.** Create main `structureCvProfile(text: string): CvProfile` orchestrator function that calls all extraction functions and assembles `CvProfile` JSON with `extractedAt` and `sourceCvS3Key`.

### Phase 2: Lambda integration

- [x] **B10.** Update `backend/src/modules/cvModule/parseCvPdf/handler.ts`: After PDF text extraction, call `structureCvProfile(text)` to get `cvProfile`.
- [x] **B11.** Update handler: Add DynamoDB `UpdateItem` call to persist `cvProfile` attribute on `UserProfile` table along with `cvS3Key` and `updatedAt`.
- [x] **B12.** Update handler response: Include `cvProfile` in the 200 response `{ key, text, charCount, cvProfile }`.
- [x] **B13.** Add error handling: Wrap extraction in try-catch; on failure, log error and return previous `cvProfile` if exists, else return response without `cvProfile` (do not fail the upload).
- [x] **B14.** Add input validation: Truncate CV text to max 50,000 chars before extraction; reject empty text with 422.

### Phase 3: Testing

- [ ] **B15.** Create `backend/src/modules/cvModule/parseCvPdf/__tests__/structureExtraction.test.ts`: Write unit tests for `extractSkills()` with known dictionary entries (=5 test cases covering variations, caps, normalization).
- [ ] **B16.** Enhance test file: Add unit tests for `extractExperience()` with various date formats (MM/YYYY, Month YYYY, YYYY-YYYY, "Present").
- [ ] **B17.** Enhance test file: Add unit tests for `extractEducation()` with degree pattern matching (B.Sc., M.Sc., Bachelor's, etc.).
- [ ] **B18.** Enhance test file: Add unit tests for `extractNameAndSummary()` and caps validation (40 skills, 15 experiences, 10 education).
- [ ] **B19.** Update `backend/src/modules/cvModule/parseCvPdf/__tests__/parseCvPdf.test.ts`: Add integration test mocking S3 GetObject, verifying `cvProfile` is persisted to DynamoDB and included in response.
- [ ] **B20.** Manual smoke test: Deploy to `dev` stage; upload a real PDF CV via UI; verify `POST /cv/parse` response includes populated `cvProfile.skills` array.

---

## Database schema update

- [ ] **D1.** Update `specs/02-database-schema.md`: Document `cvProfile?: CvProfile` optional attribute on `UserProfile` interface with inline type definitions.
- [ ] **D2.** Verify DynamoDB table schema allows optional nested map/document attribute (no migration needed; test write/read with sample `cvProfile` JSON).

---

## Frontend integration

### Phase 4: Profile UI updates

- [ ] **F1.** Create `frontend/src/features/profile/components/SkillsSection.tsx`: Skills display component with chips, add/remove functionality, editing state.
- [ ] **F2.** Update profile page (e.g., `frontend/src/app/(dashboard)/profile/page.tsx` or settings): Fetch user profile including `cvProfile` attribute; pass to `SkillsSection`.
- [ ] **F3.** Implement `SkillsSection`: Display `cvProfile.skills` as editable chips; allow user to add custom skill (input + button) and remove skills (chip delete icon).
- [ ] **F4.** Implement save flow: On "Save Profile" button, `PUT /profile` with updated `cvProfile.skills` array (merge with existing profile data); show success/error feedback.
- [ ] **F5.** (Optional MVP) Create read-only display for `cvProfile.experience` and `cvProfile.education` sections in profile UI (formatted lists with title/company/period and degree/institution/year).

### Phase 5: Dropzone feedback

- [ ] **F6.** Update `CvUploadDropzone` component: After successful `POST /cv/parse`, display extracted skills count (e.g., "Extracted 12 skills from your CV") in success message.
- [ ] **F7.** Add navigation link: After successful CV parse, show "View Profile" button/link to navigate user to profile page where skills are editable.

---

## Documentation & validation

- [ ] **V1.** Update feature README or inline comments: Document skill dictionary update process (how to add new skills post-MVP).
- [ ] **V2.** Prepare 5-10 sample CVs (varying formats, well-formatted and poorly-formatted): Manually test skill extraction accuracy; document results (target =70% accuracy for well-formatted CVs).
- [ ] **V3.** Cross-check acceptance criteria AC-1 through AC-10 from `01-spec.md`: Verify all are satisfied in `dev` environment.
- [ ] **V4.** Security validation: Verify users cannot extract/update another user's `cvProfile` (test with different Cognito tokens); verify no PII leakage in CloudWatch logs.

---

## Definition of done

All tasks above are `[x]`, and:
- `POST /cv/parse` returns `cvProfile` with populated skills array for text PDFs
- `UserProfile.cvProfile` is persisted in DynamoDB
- Profile UI displays editable skills chips
- User can add/remove skills and save changes via `PUT /profile`
- No AI API costs incurred (only Lambda + DynamoDB)
- Acceptance criteria AC-1 through AC-10 are satisfied
- No `.cursorrules` guardrails violated

