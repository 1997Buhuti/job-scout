# Feature: Preferences & Guardrails — Plan (How)

**Feature slug:** `05-preferences`
**Spec:** [01-spec.md](01-spec.md)
**Tasks:** [03-tasks.md](03-tasks.md)

---

## Approach

Preferences are stored as new attributes on the existing `UserProfile` item, so no new table or key is needed. The profile API (`GET` and `PUT /me/profile`) gets the new fields and the same partial-update rule as `targetRoles`. The job search pipeline reads the stored preferences and applies the excluded keyword and work mode filters before Bedrock is called. The filter logic lives in a pure function so it can be tested without AWS.

Work is split into four parts, in this order:

1. Schema and profile API (backend)
2. Filter logic and pipeline wiring (backend, depends on the scheduler pipeline)
3. Profile UI (frontend, depends on step 1)
4. Verification against the acceptance criteria

---

## Design decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Storage | New attributes on the `UserProfile` item | Matches the existing profile pattern. One read gives the pipeline everything it needs. |
| Salary | Stored and validated, never read by the pipeline | Most Sri Lankan postings do not publish salary. Storing it keeps the data for later. |
| Digest frequency | Stored as `scheduleIntervalDays` with values 1, 7, 30 from the UI | Reuses the scheduler field. No second frequency field to keep in sync. |
| Excluded keyword matching | Case-insensitive, whole word, on title and description | Whole-word avoids dropping jobs over substrings. Title-only is still an open question in the spec. |
| Work mode filter | Drop only when the work mode is known and not selected | Many portals expose no work mode. Dropping unknown jobs would hide valid matches. |
| Filter location | Before the Bedrock call | Excluded jobs cost no tokens. |
| Validation | Backend is the source of truth | Frontend checks are for UX only. |

---

## Dependencies

- `03-auth-profile` is complete: profile API, `UserProfile` item, and `targetRoles` persistence. Its tasks show this is done.
- `02-job-scheduler` owns `runUserPipeline`. Its tasks B1 to B10 are not yet checked off, so the pipeline wiring (P-tasks) cannot be finished until that pipeline exists. The pure filter module and its tests can be built first.
- The frontend Scheduler page is a placeholder. The digest frequency selector in this feature saves `scheduleIntervalDays` through the profile API, so it does not depend on the Scheduler page.

---

## Backend: profile API

- Extend the `UserProfile` type and the defaults in `getProfile`. Defaults: `excludedKeywords` `[]`, `workModes` `["remote", "hybrid"]`, `minMonthlySalaryLkr` `null`, `scheduleIntervalDays` `7`.
- Add validators next to `validateTargetRoles`:
  - `excludedKeywords`: array, trimmed, lowercased, non-empty, max 20 entries, max 40 characters each, deduplicated.
  - `workModes`: non-empty array of `remote`, `hybrid`, `onsite`.
  - `minMonthlySalaryLkr`: `null` or integer 0 to 10,000,000.
  - `scheduleIntervalDays`: one of 1, 7, 30.
- Change `updateProfile` so each field is added to the `UpdateExpression` only when present in the request. This keeps partial updates from overwriting other fields.

## Backend: filter and pipeline

- Add a pure module, for example `filterJobs.ts`, with:
  - `matchesExcludedKeyword(job, keywords)`
  - `matchesWorkMode(job, workModes)`
  - `filterJobsForUser(jobs, prefs)`
- Call `filterJobsForUser` in `runUserPipeline` after scraping and before Bedrock. Read preferences from the profile at the start of the run.
- Do not read `minMonthlySalaryLkr` in this module.

## Frontend

- Extend `profileService.ts` types and the update call to send and receive the new fields.
- Follow the feature-driven layout in the workspace rules. Put the new components in `frontend/src/features/profile/components/`, hooks in `features/profile/hooks/`, and types in `features/profile/types/`. Use `components/ui` for chips, toggles, inputs, and buttons. Do not place the cards in `components/` or the forms in `app/`.
- Target Roles & Focus card: role chips (existing) and excluded keyword chips.
- Preferences & Guardrails card: work mode toggles, salary input, digest frequency selector.
- One load on mount, one save path, inline errors per field from the API `400` response.

---

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Scheduler pipeline not built yet | Filter cannot be wired end to end | Build and test the pure filter first. Wire it when `runUserPipeline` exists. |
| Portals do not expose work mode | Work mode filter has no effect on those portals | Spec says unknown is kept. Confirm before release. |
| Keyword false positives in descriptions | Good jobs dropped | Start with title and description as specified. Revisit after reviewing real results. |
| Existing profile items lack new fields | Reads fail or return `undefined` | Defaults applied in `getProfile`. Test with an item that has no new fields. |

---

## Out of scope for this plan

- Salary use in any search or matching step.
- Real-time or webhook delivery.
- Changes to CV extraction or upload.
