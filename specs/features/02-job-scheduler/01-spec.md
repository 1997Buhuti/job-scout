# Feature: Job Scheduler — Spec (What & Why)

**Feature slug:** `02-job-scheduler`  
**App:** Job Scout  
**Related schema:** [../../02-database-schema.md](../../02-database-schema.md) (`UserProfile` scheduler fields, `MatchResult` omit rule)

---

## Problem / context

Users should not have to trigger scrapes by hand. Job Scout must run scrape → match → email on a **user-chosen interval**, while never re-suggesting a job posting the user has already been shown. Interval is bounded so Bedrock and Lambda cost stay inside the $50 credit budget.

---

## Goals

1. Authenticated users can enable a scheduler and set how often it runs.
2. Interval is **at least daily** and **at most monthly**.
3. When a run is due, the system scrapes configured Sri Lankan portals, evaluates **new** jobs against the user’s CV / target roles, and sends one SES digest.
4. Jobs **already suggested** to that user are omitted for the rest of that user’s history.

---

## Functional requirements

### FR-1 — User-configured interval

- The user sets `scheduleIntervalDays`: integer **1–30** inclusive.
  - **1** = daily (minimum).
  - **30** = monthly (maximum for MVP; 30-day month, not calendar-month end).
- UI may offer presets (Daily = 1, Weekly = 7, Monthly = 30) plus a custom value in range.
- Values outside 1–30 are rejected (`400`).
- The user can enable or disable the scheduler (`schedulerEnabled`).

### FR-2 — Automatic runs

- While `schedulerEnabled` is true and the user has a usable CV (`cvS3Key`) and at least one `targetRoles` entry, the backend runs the pipeline when `nextRunAt <= now`.
- After a successful pipeline attempt (scrape completed; match/digest may send zero jobs), set `lastRunAt` and `nextRunAt = lastRunAt + scheduleIntervalDays` (UTC days).
- Disabled users are never dispatched.

### FR-3 — Scrape on schedule

- Due runs scrape the portals listed in the project overview (TopJobs.lk, Rooster.jobs, Careers.lk, ITPro.lk, JobSeeker.lk) using `axios` + `cheerio` or JSON extraction only.
- Persist `JobPosting` by URL-hash `jobId` (upsert).

### FR-4 — Omit already suggested jobs

- **Suggested** means a `MatchResult` already exists for that user and `jobId` (`partitionKey` = `${userId}#${jobId}`).
- Those jobs MUST be skipped: no Bedrock evaluation, no line in a later digest, even if the listing is scraped again.
- Existence of the match row is enough; do not require `sentAt` to treat it as suggested (covers evaluate-succeeded / email-failed retries without re-billing Bedrock).
- Deduplicate by `jobId` within a single run as well.

### FR-5 — Digest of new matches only

- Remaining unevaluated jobs go to Bedrock Haiku (max 300 output tokens each).
- High-scoring new matches are bundled into **one** HTML SES email for that run.
- Set `sentAt` on matches included in a successful send.

---

## Non-goals

- Intervals more frequent than daily (hourly / every few hours).
- Intervals longer than 30 days.
- Per-user EventBridge rules (too expensive).
- User-picked clock time of day (MVP: dispatcher cadence + `nextRunAt` is enough).
- Calendar-month alignment (e.g. “1st of each month”) — MVP uses 30-day steps for “monthly”.
- Re-suggesting a job because the listing text changed.

---

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | User can save `scheduleIntervalDays` in 1–30; 0 and 31 are rejected. |
| AC-2 | User can toggle `schedulerEnabled`. |
| AC-3 | A due user (`nextRunAt` in the past, enabled, CV + roles present) is processed by the dispatcher. |
| AC-4 | After a run, `nextRunAt` is at least `scheduleIntervalDays` days after `lastRunAt`. |
| AC-5 | A job with an existing `MatchResult` for that user is not sent to Bedrock on a later run. |
| AC-6 | A job already in a previous digest (`sentAt` set) does not appear in a new email. |
| AC-7 | Disabled or not-due users are not scraped in that tick. |
| AC-8 | No Puppeteer/Playwright/Selenium; Bedrock only Haiku with 300-token cap. |

---

## Constraints

- **AWS only:** EventBridge, Lambda, DynamoDB, S3, Bedrock, SES, Cognito, API Gateway.
- **Cost:** One shared EventBridge schedule (e.g. daily or hourly tick), not one rule per user.
- **SDK:** AWS SDK v3 only.
- **Runtime:** Node.js 20.x, Serverless Framework v3, region `us-east-1`.
- **Scraping:** `axios` + `cheerio` / `__NEXT_DATA__` only.
