# Job Scout — Project Overview

## Vision

**Job Scout** is an automated job aggregator and AI match engine for Sri Lankan tech portals. It scrapes public listings, evaluates fit against each user’s CV and target roles via Amazon Bedrock (Claude Haiku), and delivers a concise HTML email digest — all on a minimal AWS footprint aimed at a **$50 credits** budget.

### Target portals

| Portal | Role in MVP |
| --- | --- |
| TopJobs.lk | Primary scraper source |
| Rooster.jobs | Primary scraper source |
| Careers.lk | Primary scraper source |
| ITPro.lk | Primary scraper source |
| JobSeeker.lk | Primary scraper source |

Scraping is **lightweight only**: `axios` + `cheerio`, or Next.js `__NEXT_DATA__` / public JSON extraction. Puppeteer, Playwright, and Selenium are forbidden.

---

## End-to-end architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (AWS Amplify Gen 2)                                   │
│  Next.js App Router · TypeScript · Tailwind CSS                 │
│  Cognito auth · CV dropzone · profile / schedule settings       │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (API Gateway)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend (Serverless Framework v3)                              │
│  Node.js 20.x · TypeScript · AWS SDK v3 (@aws-sdk/*)            │
│  Region: us-east-1                                              │
│                                                                 │
│  Lambdas: auth/profile · presigned upload · CV parse ·          │
│           EventBridge dispatcher · scrapers · Bedrock match ·   │
│           SES digest                                            │
└───────┬───────────┬───────────┬───────────┬─────────────────────┘
        │           │           │           │
        ▼           ▼           ▼           ▼
   DynamoDB        S3      Bedrock       SES
   (profiles,   (CV PDFs)  Claude Haiku  (HTML digests)
    jobs,                  (max 300
    matches)               tokens/eval)
```

### Stack summary

| Layer | Choice | Constraint |
| --- | --- | --- |
| App name | Job Scout | — |
| Region | `us-east-1` | Required for Bedrock Claude Haiku |
| Frontend | Next.js App Router on **AWS Amplify Gen 2** | No Vercel / Firebase / Supabase |
| Backend | **Serverless Framework v3**, Node.js **20.x**, TypeScript | AWS SDK **v3** only |
| Auth | Amazon Cognito (via Amplify Gen 2) | Cognito Sub = `userId` |
| Data | Amazon DynamoDB | Single-table or few-table, pay-per-request |
| Files | Amazon S3 | Presigned uploads for CVs |
| AI | Amazon Bedrock · `anthropic.claude-3-haiku-20240307-v1:0` | Max **300** output tokens per job evaluation |
| Email | Amazon SES | HTML digest delivery |
| Scraping | `axios` + `cheerio` / Next.js JSON | No browser automation |
| Scheduler | EventBridge (shared tick) + dispatcher Lambda | Per-user interval: min daily, max monthly |

---

## Key capabilities

### 1. User registration & profile

- Sign-up / sign-in via Cognito (Amplify Gen 2).
- Persist `UserProfile` in DynamoDB: email, `targetRoles[]`, `cvS3Key`, `scheduleIntervalDays`, scheduler timestamps.
- `userId` is the Cognito Sub ID.

### 2. CV upload (S3 presigned URL)

- Frontend requests a short-lived **presigned PUT URL** from a Lambda.
- Browser uploads the PDF **directly to S3** (no Lambda payload for the file).
- A follow-up Lambda downloads the object and extracts text from the PDF for matching.

### 3. User-configured job scheduler

- Each user sets how often Job Scout should scrape and match: **minimum once per day**, **maximum once per month**.
- MVP interval is `scheduleIntervalDays` from **1** (daily) through **30** (monthly). Presets (daily / weekly / monthly) are allowed; custom days in that range are allowed.
- A **single** EventBridge rule ticks the fleet (do not create one schedule per user — cost). A dispatcher Lambda runs only users whose `nextRunAt` is due.
- After a run, persist `lastRunAt` and compute `nextRunAt` from the user’s interval.

### 4. Custom scraper engine

- Due-user runs fetch listing pages with `axios`.
- Parse HTML with `cheerio`, or extract embedded Next.js / JSON payloads where available.
- Normalize into `JobPosting` records; `jobId` = MD5 hash of the canonical job URL.
- Store in DynamoDB; keep `rawDescription` for Bedrock evaluation.
- Upsert by `jobId` so the same listing URL is not duplicated globally.

### 5. Bedrock AI evaluation (new jobs only)

- For each due user, evaluate **only jobs that have never been suggested to that user**.
- A job is already suggested if a `MatchResult` exists for `${userId}#${jobId}` (whether or not `sentAt` is set). Skip scrape-to-email for those IDs — no second Bedrock call, no second digest line.
- Model ID: `anthropic.claude-3-haiku-20240307-v1:0`.
- Cap `max_tokens` at **300** per evaluation.
- Persist `MatchResult`: score, reasoning, matching skills, `sentAt` when emailed.

### 6. SES HTML email digest

- Aggregate high-scoring **new** matches for that run into one HTML digest via SES.
- Set `sentAt` after a successful send so the same match cannot be emailed again.

---

## Cost guardrails

- Prefer on-demand DynamoDB, short Lambda timeouts, and S3 lifecycle rules for old CVs if needed.
- Never call non-AWS AI APIs.
- Never escalate scraping to headless browsers.
- Keep Bedrock prompts short; enforce the 300-token output cap.
- One shared EventBridge tick + skip already-suggested jobs to avoid wasted scrape/Bedrock/SES spend.

---

## Repository layout (reference)

| Path | Role |
| --- | --- |
| `frontend/` | Next.js App Router (Amplify Gen 2) |
| `backend/` | Serverless Framework API & workers |
| `specs/` | Spec-Driven Development artifacts (source of truth) |
| `.github/workflows/` | Backend CI (PRs) and prod deploy (OIDC) |

Implementation must follow `/specs` before any code changes. See [01-sdd-workflow.md](./01-sdd-workflow.md).  
Branching & CI/CD: [features/00-branching-cicd/01-spec.md](./features/00-branching-cicd/01-spec.md).  
Delivery tracking: [JobScout GitHub Project](https://github.com/users/1997Buhuti/projects/1).
