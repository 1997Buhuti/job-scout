# Feature: Job Scheduler — Tasks

**Feature slug:** `02-job-scheduler`  
**Follow:** [01-spec.md](./01-spec.md) · [02-plan.md](./02-plan.md)  
**Protocol:** Execute **one** unchecked task at a time; wait for confirmation; then mark `[x]`.

---

## Backend setup

- [ ] **B1.** Extend `UserProfile` persistence with `scheduleIntervalDays` (1–30), `schedulerEnabled`, `lastRunAt`, `nextRunAt`, and users GSI1 (`SCHED#true` / `NEXT#{nextRunAt}`) per `specs/02-database-schema.md`.
- [ ] **B2.** Implement `PUT /me/schedule` (`updateSchedule`): Cognito auth, validate interval, persist fields, set `nextRunAt` when enabling.
- [ ] **B3.** Add EventBridge schedule on Serverless Framework v3 (shared tick, not per-user) invoking `schedulerDispatcher`.
- [ ] **B4.** Implement `schedulerDispatcher`: query due enabled users with CV + target roles; invoke `runUserPipeline` per due user.
- [ ] **B5.** Implement scrape step in `runUserPipeline` (`axios` + `cheerio` / JSON); upsert `JobPosting` by URL-hash `jobId`.
- [ ] **B6.** Implement omit-already-suggested: load existing `MatchResult`s for the user; drop those `jobId`s before Bedrock.
- [ ] **B7.** Evaluate remaining jobs with Bedrock Haiku (`max_tokens` 300); `PutItem` new `MatchResult`s.
- [ ] **B8.** Send one SES HTML digest for new high-score matches; set `sentAt`; skip email if zero new matches.
- [ ] **B9.** On pipeline completion, set `lastRunAt` and `nextRunAt += scheduleIntervalDays` (UTC).
- [ ] **B10.** Verify: second run for the same user does not Bedrock or email a previously matched `jobId`.

---

## Frontend UI integration

- [ ] **F1.** Add schedule settings UI: enable toggle, Daily / Weekly / Monthly presets, custom 1–30 days, validation errors.
- [ ] **F2.** Wire authenticated `PUT /me/schedule` and show saved interval + next-run copy.
- [ ] **F3.** End-to-end: save daily schedule, confirm profile fields; confirm UI copy that previously suggested jobs are not repeated.

---

## Definition of done

All tasks above are `[x]`, and acceptance criteria AC-1 through AC-8 in `01-spec.md` are satisfied without violating `.cursorrules` guardrails.
