# Feature: Job Scheduler — Plan (How)

**Feature slug:** `02-job-scheduler`  
**Implements:** [01-spec.md](./01-spec.md)  
**Stack:** Serverless Framework v3 · Node.js 20.x · AWS SDK v3 · EventBridge · DynamoDB · Bedrock Haiku · SES · Amplify Gen 2 · `us-east-1`

---

## Architecture overview

```text
User (Next.js) saves scheduleIntervalDays (1–30) + schedulerEnabled
        |
        v
DynamoDB UserProfile (GSI1: SCHED#true / NEXT#{nextRunAt})

EventBridge rule (shared tick, e.g. rate(1 hour) or cron daily UTC)
        |
        v
Lambda: schedulerDispatcher
  - Query GSI1 where nextRunAt <= now
  - For each due user: enqueue or invoke runUserPipeline
        |
        v
Lambda: runUserPipeline (or same function, sequential for MVP)
  1. Load UserProfile + CV text (S3)
  2. Scrape portals (axios + cheerio / JSON)
  3. Upsert JobPosting by jobId
  4. Batch-get MatchResult for userId + scraped jobIds
  5. Drop any jobId that already has a MatchResult  ← omit suggested
  6. Bedrock Haiku remaining jobs (max 300 tokens each)
  7. PutItem MatchResult for new evaluations
  8. SES HTML digest of new high-score matches; set sentAt
  9. Update lastRunAt, nextRunAt += scheduleIntervalDays
```

**Cost rule:** Do **not** create `AWS::Events::Rule` per user. One fleet-wide tick + DynamoDB due-query.

---

## Backend — Lambda handlers

Suggested module path:

```text
backend/src/modules/schedulerModule/
├── updateSchedule/     # authenticated API
├── dispatcher/         # EventBridge
└── runUserPipeline/    # scrape + match + digest
```

### `updateSchedule`

| Item | Detail |
| --- | --- |
| Trigger | API Gateway `PUT /me/schedule` |
| Auth | Cognito JWT; `userId` = Sub |
| Input | `{ scheduleIntervalDays: number, schedulerEnabled: boolean }` |
| Logic | Clamp/validate 1–30 integer → `UpdateItem` → if enabling and no `nextRunAt`, set `nextRunAt` to now (eligible on next tick) or now + interval (defer first run — **MVP: set nextRunAt to now** so first enabled save can run on the next tick) |
| Output | `200` updated profile scheduler fields |
| Errors | `400` invalid interval; `401` unauthenticated |

### `schedulerDispatcher`

| Item | Detail |
| --- | --- |
| Trigger | EventBridge (Serverless `events: schedule`) |
| Auth | IAM (no public HTTP) |
| SDK | `@aws-sdk/client-dynamodb` / `@aws-sdk/lib-dynamodb`; optional `@aws-sdk/client-lambda` to invoke pipeline |
| Logic | Query due users; skip if `!schedulerEnabled`, missing `cvS3Key`, or empty `targetRoles`; invoke pipeline per user (MVP: sequential to stay in timeout; later: SQS if needed) |
| Timeout | Keep dispatcher short; pipeline in a separate function with a higher timeout |

### `runUserPipeline`

| Item | Detail |
| --- | --- |
| Trigger | Invoked by dispatcher (async Lambda invoke or SQS later) |
| Scraping | `axios` + `cheerio` only |
| AI | Bedrock `anthropic.claude-3-haiku-20240307-v1:0`, `max_tokens: 300` |
| Email | `@aws-sdk/client-ses` HTML body |
| Omit rule | `BatchGetItem` / query matches for `USER#{userId}`; filter scraped `jobId`s that already exist |

If the digest has zero new matches, still advance `lastRunAt` / `nextRunAt` (empty run is a successful schedule tick). Do not send an empty marketing email unless product later wants a “no new jobs” note — **MVP: skip SES if zero new matches**.

---

## DynamoDB impact

Align with [../../02-database-schema.md](../../02-database-schema.md):

- `UserProfile`: `scheduleIntervalDays`, `schedulerEnabled`, `lastRunAt`, `nextRunAt`
- GSI1 on users for due lookup
- `MatchResult` PK `${userId}#${jobId}` is the omit index: presence = already suggested

---

## Frontend — Next.js UI

| Piece | Detail |
| --- | --- |
| Page | Profile / settings: “Job search schedule” |
| Controls | Enable toggle; presets Daily / Weekly / Monthly; optional number input 1–30 |
| Copy | Explain that already suggested jobs are never emailed again |
| API | Authenticated `PUT /me/schedule` |
| Location | e.g. `frontend/src/components/schedule/ScheduleSettings.tsx` |

---

## Serverless (v3) wiring notes

- Runtime: `nodejs20.x`
- EventBridge: `rate(1 hour)` is a reasonable tick so daily users are not delayed a full extra day; dispatcher no-ops when nobody is due
- Env: table names, `CV_BUCKET_NAME`, Bedrock model id, SES from-address
- IAM: DynamoDB query/update, S3 get CV, Bedrock invoke, SES send, Lambda invoke pipeline

---

## Security & cost notes

- Cap concurrent Bedrock calls per user run (small batch) to protect credits.
- Never re-invoke Haiku for an existing `MatchResult`.
- Shared EventBridge only.
- Lightweight scrape only.
