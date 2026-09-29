# Job Scout — Database Schema

Region: **us-east-1**. Storage: **Amazon DynamoDB** (on-demand billing preferred) + **Amazon S3** for CV binaries. All application code uses **AWS SDK v3** (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-s3`).

This document defines TypeScript interfaces and DynamoDB key structures for the three core entities, plus scheduler fields on `UserProfile`.

---

## Tables (logical)

| Logical entity | Suggested table name | Access pattern focus |
| --- | --- | --- |
| `UserProfile` | `JobScoutUsers` | Get/update by Cognito Sub |
| `JobPosting` | `JobScoutJobs` | Get by job URL hash; query recent by source |
| `MatchResult` | `JobScoutMatches` | Get by user+job; query matches for a user |

Table names may be prefixed by Serverless stage (e.g. `job-scout-dev-users`). Exact CloudFormation names are defined in `backend` Serverless config when implemented.

---

## 1. `UserProfile`

### TypeScript interface

```typescript
/** Inclusive user-configured scrape interval. Min daily (1), max monthly (30). */
export type ScheduleIntervalDays = number; // integer 1–30

export interface UserProfile {
  /** Cognito Sub ID — primary identity */
  userId: string;
  email: string;
  targetRoles: string[];
  /** S3 object key for the uploaded CV PDF, e.g. `cvs/{userId}/{timestamp}.pdf` */
  cvS3Key?: string;
  /**
   * How often this user’s scrape + match + digest should run.
   * 1 = daily (minimum). 30 = monthly (maximum). Reject values outside 1–30.
   */
  scheduleIntervalDays: ScheduleIntervalDays;
  /** When false, dispatcher skips this user. */
  schedulerEnabled: boolean;
  /** ISO-8601 last successful scheduled run (scrape + match + digest attempt). */
  lastRunAt?: string;
  /** ISO-8601 when the dispatcher should next include this user. */
  nextRunAt?: string;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}
```

### DynamoDB key structure

| Attribute | Role | Example |
| --- | --- | --- |
| `PK` | Partition key = `USER#{userId}` | `USER#a1b2c3d4-...` |
| `SK` | Sort key = `PROFILE` | `PROFILE` |

**Alternate (simple PK):** If a dedicated users table is used without a composite key:

| Attribute | Role |
| --- | --- |
| `userId` | Partition key (Cognito Sub) |

### Access patterns

- `GetItem` by `userId` / `PK+SK`
- `UpdateItem` for `targetRoles`, `cvS3Key`, `scheduleIntervalDays`, `schedulerEnabled`
- Dispatcher: query users due to run (`nextRunAt <= now`, `schedulerEnabled = true`)

**GSI (recommended for scheduler dispatcher):**

| Index | PK | SK | Purpose |
| --- | --- | --- | --- |
| `GSI1` | `SCHED#{enabled}` (`SCHED#true`) | `NEXT#{nextRunAt}` | List due users without a table scan |

On interval change, recompute `nextRunAt` (typically `lastRunAt + interval` or `now + interval` if never run).

### S3 linkage

- Bucket: stage-scoped CV bucket (e.g. `job-scout-{stage}-cvs`)
- Object key stored in `cvS3Key`
- Uploads via **presigned PUT** only; private bucket, no public ACLs

---

## 2. `JobPosting`

### TypeScript interface

```typescript
export type SourceSite =
  | "topjobs.lk"
  | "rooster.jobs"
  | "careers.lk"
  | "itpro.lk"
  | "jobseeker.lk";

export interface JobPosting {
  /** MD5 hex digest of the canonical job URL */
  jobId: string;
  sourceSite: SourceSite;
  title: string;
  company: string;
  url: string;
  rawDescription: string;
  scrapedAt: string; // ISO-8601
}
```

### DynamoDB key structure

| Attribute | Role | Example |
| --- | --- | --- |
| `PK` | Partition key = `JOB#{jobId}` | `JOB#5d41402abc4b2a76b9719d911017c592` |
| `SK` | Sort key = `META` | `META` |

**GSI (recommended for scrapers):**

| Index | PK | SK | Purpose |
| --- | --- | --- | --- |
| `GSI1` | `SOURCE#{sourceSite}` | `SCRAPED#{scrapedAt}` | List recent jobs per portal |

### Access patterns

- `PutItem` / `GetItem` by `jobId` (idempotent upserts when URL hash matches)
- Query `GSI1` for recent jobs per `sourceSite`

### ID derivation

```typescript
import { createHash } from "node:crypto";

export function jobIdFromUrl(canonicalUrl: string): string {
  return createHash("md5").update(canonicalUrl).digest("hex");
}
```

---

## 3. `MatchResult`

### TypeScript interface

```typescript
export interface MatchResult {
  /**
   * Composite identity: `${userId}#${jobId}`
   * Also used as the DynamoDB partition key value (see below).
   */
  partitionKey: string;
  userId: string;
  jobId: string;
  matchScore: number; // 0–100
  reasoning: string;
  matchingSkills: string[];
  /** ISO-8601 when included in an SES digest; undefined if not yet sent */
  sentAt?: string;
  evaluatedAt: string; // ISO-8601
}
```

### Already-suggested rule (mandatory)

If a DynamoDB item exists for `PK = ${userId}#${jobId}`, that job **must** be omitted from later scrape → Bedrock → digest cycles for that user. Do not call Bedrock again. Do not include it in a later email even if the listing is re-scraped. Presence of the row is enough; `sentAt` is not required.

### DynamoDB key structure

| Attribute | Role | Example |
| --- | --- | --- |
| `PK` | Partition key = `${userId}#${jobId}` | `a1b2c3d4-...#5d41402abc4b2a76...` |
| `SK` | Sort key = `MATCH` | `MATCH` |

**GSI (recommended for digests):**

| Index | PK | SK | Purpose |
| --- | --- | --- | --- |
| `GSI1` | `USER#{userId}` | `SCORE#{matchScore}#{jobId}` | Rank unsent matches for a user |

Store `sentAt` as an attribute; digest Lambdas filter items where `sentAt` is absent (or use a sparse GSI attribute if needed later).

### Access patterns

- `GetItem` / `BatchGetItem` before evaluation: skip any `jobId` already present for this `userId`
- `PutItem` after Bedrock evaluation (idempotent on same user+job)
- Query by user for unsent high-score matches before SES send
- `UpdateItem` to set `sentAt` after successful email

### Bedrock constraints (write path)

- Model: `anthropic.claude-3-haiku-20240307-v1:0`
- Max output tokens: **300** per evaluation
- Persist truncated `reasoning` and `matchingSkills` as returned within that budget

---

## Cross-entity relationships

```text
UserProfile.userId  ──────────────┐
                                  │  MatchResult.partitionKey = `${userId}#${jobId}`
JobPosting.jobId    ──────────────┘

UserProfile.cvS3Key ──► s3://{cv-bucket}/{cvS3Key}
```

---

## Shared conventions

| Convention | Rule |
| --- | --- |
| Timestamps | ISO-8601 UTC strings |
| IDs | Cognito Sub for users; MD5 URL hash for jobs |
| Billing | On-demand DynamoDB capacity |
| SDK | AWS SDK v3 document client preferred for app code |
| Secrets | No secrets in item attributes; use env / SSM later if needed |

Schema changes require an update to this file **before** Lambda or frontend code that depends on the new shape.
