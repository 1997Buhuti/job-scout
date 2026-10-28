# Feature: Preferences & Guardrails — Spec (What & Why)

**Feature slug:** `05-preferences`
**App:** Job Scout
**Related schema:** [../../02-database-schema.md](../../02-database-schema.md) (`UserProfile`)
**Related features:** [../03-auth-profile/01-spec.md](../03-auth-profile/01-spec.md) (profile API and `targetRoles`), [../02-job-scheduler/01-spec.md](../02-job-scheduler/01-spec.md) (scheduling and digests), [../04-cv-structured-extract/](../04-cv-structured-extract/) (CV profile used for matching)

---

## Problem / context

The profile page stores only `targetRoles` today. Users also need to say which jobs to exclude and where they are willing to work. Without these, the matching step (Bedrock Haiku) scores every scraped job the same way, and digests fill up with jobs the user would never apply for.

This feature adds a "Target Roles & Focus" card and a "Preferences & Guardrails" card to the profile. Their values are stored on `UserProfile` in DynamoDB. Target roles, excluded keywords, and work modes are applied during job search, so saved settings change what the user receives. The salary preference is stored for future use but is not applied yet.

---

## Goals

1. Target roles are stored and used during job search, not only displayed.
2. Users can save **excluded keywords** and the system applies them during job search.
3. Users can save **work mode preferences** (Remote, Hybrid, Colombo Onsite) and the system applies them during job search.
4. Users choose a digest frequency of **daily, weekly, or monthly**, stored as `scheduleIntervalDays`.
5. Users can save a **minimum monthly salary expectation**. It is stored and returned by the API but not used in search or matching.
6. All of the above persist in DynamoDB on `UserProfile` and are returned by `GET /me/profile`.

---

## Functional requirements

### FR-1 — Target roles (extends existing)

- `targetRoles` is defined in [03-auth-profile](../03-auth-profile/01-spec.md): max 10 entries, max 80 characters each, trimmed, no empty entries.
- These roles are real search inputs. The job search pipeline uses them to build queries and to score matches. A profile with no target roles cannot run a search (see the scheduler spec, FR-2).
- UI: chips with a remove control and an "Add Role" action.

### FR-2 — Excluded keywords

- New field `excludedKeywords: string[]`.
- Each entry is trimmed and lowercased before storage, and must be non-empty.
- Max **20** entries; each entry max **40** characters.
- Duplicates are removed on save.
- UI: chips with a remove control and an "Exclude Keyword" action.
- Matching rule: a scraped job is dropped before Bedrock evaluation if its title or description contains an excluded keyword. Matching is case-insensitive and whole-word.

### FR-3 — Work mode preferences

- New field `workModes: Array<"remote" | "hybrid" | "onsite">`.
- At least one value is required. An empty array is rejected with `400`.
- Default on create: `["remote", "hybrid"]`.
- UI: three toggles labelled Remote, Hybrid, and Colombo Onsite.
- Matching rule: a scraped job is dropped before Bedrock evaluation if its work mode is known and not in `workModes`. A job with unknown work mode is kept.

### FR-3a — Minimum monthly salary (stored only)

- New field `minMonthlySalaryLkr: number | null`. `null` means no preference set.
- Integer, LKR per month. Allowed range **0** to **10,000,000**, validated on the server.
- UI: numeric input labelled "Minimum monthly salary expectation (LKR)", with a clear action that sets the value to `null`.
- The field is saved and returned by the API. It is **not** read by the job search pipeline and does **not** filter or rank jobs.
- Default on create: `null`.

### FR-4 — Digest frequency

- The UI offers three options: **Daily**, **Weekly**, and **Monthly**.
- These map onto the existing `scheduleIntervalDays` field from the scheduler spec:
  - Daily = `1`
  - Weekly = `7`
  - Monthly = `30`
- Values other than 1, 7, or 30 sent through this feature's API are rejected with `400`. The scheduler's own 1–30 range still applies to the stored field.
- Real-time or webhook delivery is not part of this feature.
- Default on create: Weekly (`7`), matching the existing default.

### FR-5 — Profile API

- `GET /me/profile` returns `targetRoles`, `excludedKeywords`, `workModes`, `minMonthlySalaryLkr`, and `scheduleIntervalDays`. Missing fields use defaults: `[]`, `[]`, `["remote", "hybrid"]`, `null`, and `7`.
- `PUT /me/profile` accepts any subset of these fields. Unknown fields are ignored.
- Partial updates do not overwrite fields that were not sent.
- Clients still cannot set `userId`, `cvS3Key`, or scheduler run timestamps.

### FR-6 — Profile settings UI

- Target Roles & Focus and Preferences & Guardrails are two cards on the profile page, matching the approved mock.
- Digest frequency is a three-option selector: Daily, Weekly, Monthly.
- Save is explicit. Errors are shown inline per field.
- Read-only email stays as defined in `03-auth-profile`.

### FR-7 — Job search pipeline

- The `runUserPipeline` step reads the user's preferences at the start of each run.
- It uses `targetRoles` to drive the search, applies the FR-2 and FR-3 filters to scraped jobs, and only then calls Bedrock.
- Filtering before Bedrock means excluded jobs cost no tokens.
- `minMonthlySalaryLkr` is not read by this step.
- Preference changes take effect from the next run.

---

## Non-goals

- Using the salary preference in search, matching, ranking, or digests.
- Salary parsing from job postings.
- Currency handling beyond the LKR label.
- Real-time or webhook delivery.
- Per-job manual overrides of preferences.
- Changes to CV upload or CV extraction.
- Changing the Bedrock prompt beyond what the matching spec already defines.

---

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | `GET /me/profile` for a new user returns `targetRoles: []`, `excludedKeywords: []`, `workModes: ["remote", "hybrid"]`, `minMonthlySalaryLkr: null`, `scheduleIntervalDays: 7`. |
| AC-2 | `PUT /me/profile` with `excludedKeywords` persists them trimmed, lowercased, and deduplicated. |
| AC-3 | More than 20 excluded keywords, or any keyword longer than 40 characters, returns `400`. |
| AC-4 | `workModes: []`, or any value other than `remote`, `hybrid`, `onsite`, returns `400`. |
| AC-5 | `scheduleIntervalDays` values other than 1, 7, or 30 sent through the API return `400`. |
| AC-6 | `PUT /me/profile` with `minMonthlySalaryLkr` persists it. `null` clears it. Values outside 0–10,000,000, or non-integers, return `400`. |
| AC-7 | A `PUT` that sends only `workModes` leaves `targetRoles`, `excludedKeywords`, `minMonthlySalaryLkr`, and `scheduleIntervalDays` unchanged. |
| AC-8 | A scraped job containing an excluded keyword is not sent to Bedrock. |
| AC-9 | A scraped job whose work mode is known and not selected is not sent to Bedrock. A job with unknown work mode is not dropped by this rule. |
| AC-10 | A search run uses the saved `targetRoles` to drive the job search. Changing them changes the jobs returned on the next run. |
| AC-11 | Changing `minMonthlySalaryLkr` does not change which jobs are sent to Bedrock. |
| AC-12 | The profile UI shows both cards and the Daily / Weekly / Monthly selector. It saves all fields and reloads the saved values on refresh. |

---

## Constraints

- **AWS only:** DynamoDB for storage, Lambda and API Gateway for the API.
- **SDK:** AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`).
- **Region:** `us-east-1`.
- **Schema:** New fields are added to the `UserProfile` item. No new table.
- **Backward compatibility:** Existing profile items without the new fields load using the defaults in FR-5.
- **Validation:** The backend is the source of truth. The frontend may mirror it for UX only.
- **Testing:** Unit tests for validation and the filter rules. Filters are pure functions, so they can be tested without AWS.

---

## Open questions

1. **Excluded keyword scope.** Should a match on the title alone drop the job, or should description matches count too? Description matches catch more unwanted jobs but also produce more false positives.
2. **Work mode detection.** Which target portals expose remote, hybrid, or onsite information? Where a portal exposes nothing, the job is kept and the filter has no effect there. Please confirm this is acceptable.
3. **Save behaviour.** One save button for both cards, or one per card?

---

## Dependencies

- `03-auth-profile` must be complete (profile API and `UserProfile` item).
- `02-job-scheduler` owns the pipeline that applies these filters. Its implementation should read preferences from the profile, not duplicate them.
- `04-cv-structured-extract` provides `cvProfile` for matching. This feature does not change it.
