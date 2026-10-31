# Feature: Preferences & Guardrails — Tasks

**Spec:** [01-spec.md](01-spec.md)
**Plan:** [02-plan.md](02-plan.md)

Status key: `[ ]` not started, `[x]` done. Task IDs: **D** = docs, **B** = backend profile API, **P** = pipeline filter, **F** = frontend, **V** = verification.

---

## D — Documentation

- [x] **D1.** Add `excludedKeywords`, `workModes`, `minMonthlySalaryLkr` to the `UserProfile` interface and the access patterns in `specs/02-database-schema.md`.

## B — Backend profile API

- [x] **B1.** Extend the `UserProfile` type and the defaults in `getProfile` (`excludedKeywords []`, `workModes ["remote","hybrid"]`, `minMonthlySalaryLkr null`, `scheduleIntervalDays 7`). Covers FR-5, AC-1.
- [x] **B2.** Add validators: `excludedKeywords` (max 20, max 40 chars, trimmed, lowercased, deduplicated), `workModes` (non-empty, known values), `minMonthlySalaryLkr` (null or integer 0 to 10,000,000), `scheduleIntervalDays` (1, 7, or 30). Covers AC-3, AC-4, AC-5, AC-6.
- [x] **B3.** Update `updateProfile` to add each new field to the `UpdateExpression` only when it is present, so partial updates don't overwrite other fields. Covers AC-2, AC-7.
- [x] **B4.** Unit tests for B2 and B3 in the existing `updateProfile` test file, including a partial update that sends only `workModes`.
- [x] **B5.** Unit test `getProfile` returns defaults for an item without the new fields.

## P — Pipeline filter

- [x] **P1.** Create a pure filter module with `matchesExcludedKeyword`, `matchesWorkMode`, and `filterJobsForUser`. Keyword match is case-insensitive and whole-word on title and description. Work mode drops only known, unselected modes. Does not read salary.
- [x] **P2.** Unit tests for P1. Covers AC-8 and AC-9 (unknown work mode is kept), and AC-11 (salary has no effect).
- [ ] **P3.** Wire `filterJobsForUser` into `runUserPipeline` after scraping and before Bedrock, reading preferences from the profile at run start. Blocked until scheduler tasks B1 to B10 in `02-job-scheduler` exist.
- [ ] **P4.** Confirm `targetRoles` drives the search query and changing them changes results on the next run. Covers AC-10. Blocked on the same scheduler work as P3.

## F — Frontend

- [x] **F1.** Extend `frontend/src/lib/api/profileService.ts` types and the update call for the new fields. Put feature types under `frontend/src/features/profile/types/`.
- [ ] **F2.** Target Roles & Focus card in `features/profile/components/`: existing role chips plus excluded keyword chips (add and remove, validation inline).
- [ ] **F3.** Preferences & Guardrails card: work mode toggles (Remote, Hybrid, Colombo Onsite; at least one required), minimum salary input with clear action, Daily / Weekly / Monthly selector mapped to 1 / 7 / 30.
- [ ] **F4.** Load on mount, save through `PUT /me/profile`, show inline errors from `400` responses, reload saved values on refresh. Covers AC-12.
- [ ] **F5.** Use `components/ui` primitives for chips, toggles, inputs, and buttons. Do not place feature components in `components/` or `app/`.

## V — Verification

- [ ] **V1.** Run the backend Jest suite and confirm all B and P tests pass.
- [ ] **V2.** Run the frontend build and confirm it passes with no type errors.
- [ ] **V3.** Check each acceptance criterion AC-1 to AC-12 against the running API and UI. Record what was checked and what could not be verified.
- [ ] **V4.** Confirm the salary value is stored and returned but has no effect on the pipeline (AC-11).
- [ ] **V5.** Remove any temporary files created during verification.
