# Feature: Queued Scheduler — Plan (How)

**Feature slug:** `07-queued-scheduler`
**Spec:** [01-spec.md](01-spec.md)
**Tasks:** [03-tasks.md](03-tasks.md)

---

## Approach

We split the single-dispatcher Lambda (B4) into two:
- **`schedulerDispatcher`** (hourly EventBridge) queries due users and enqueues them on an SQS queue.
- **`userPipelineWorker`** (SQS-triggered) runs the full pipeline for one user, with retry and dead‑letter queue handling.

The worker claims the user with a short lease (`leaseUntil`) to prevent duplicate processing, then runs the existing `runSchedulerPipelineForUser` logic unchanged. After a success it deletes the message; on failure the SQS retry mechanism applies.

---

## Architecture

```text
EventBridge (rate(1 hour))
       |
       v
[ schedulerDispatcher ]
       |
       v
  SQS queue (user-runs)
       |
       +---[ userPipelineWorker ]──► scrape → evaluate → deliverDigest → advanceSchedule
       |
       v
  Dead‑letter queue (user-runs-dlq)
```

**Lease claim:**
- Worker reads user profile
- Attempts `UpdateItem` with `ConditionExpression`: `(leaseUntil = :absent OR leaseUntil < :now) AND userId = :userId`
- If condition passes, sets `leaseUntil = :leaseEnd` (e.g., now + 10 minutes)
- If condition fails, another worker has the lease; this worker returns early without scraping

**After pipeline:**
- Worker deletes SQS message
- No explicit lease cleanup needed (it expires)

---

## Queue configuration

| Property | Value | Rationale |
| --- | --- | --- |
| Queue name | `job-scout-${stage}-user-runs` | |
| Visibility timeout | 350 seconds (5 min 50 s) | Longer than Lambda timeout (300 s) + buffer |
| Maximum receives | 3 | Enough for transient errors, not infinite retry |
| Dead‑letter queue | `job-scout-${stage}-user-runs-dlq` | Retains for 14 days |
| DLQ redrive policy | After 3 attempts, move to DLQ | |

**Worker Lambda:**
- Trigger: SQS `user-runs` queue
- Reserved concurrency: 2 (adjustable via env var)
- Timeout: 300 seconds (same as original dispatcher)
- Memory: 1024 MB (same)

---

## Data flow

### Step 1: Dispatcher (hourly tick)
```typescript
const dueUsers = await queryDueUsers(now);
const usersThisTick = dueUsers.slice(0, MAX_USERS_PER_DISPATCH);

for (const user of usersThisTick) {
  await sqs.sendMessage({
    QueueUrl: process.env.USER_RUNS_QUEUE_URL,
    MessageBody: JSON.stringify({ userId: user.userId }),
    MessageAttributes: {
      enqueuedAt: { DataType: 'String', StringValue: now.toISOString() },
    },
  });
}
```

### Step 2: Worker (per message)
```typescript
// 1. Parse userId from message
// 2. Attempt lease claim (conditional UpdateItem)
// 3. If lease acquired:
//    - Re-read fresh profile (respects any email/status changes)
//    - Run runSchedulerPipelineForUser with same deps as before
//    - Delete message from queue
// 4. If lease not acquired:
//    - Log and exit (no delete; visibility timeout hides message)
// 5. Catch errors:
//    - Log error, throw so Lambda reports failure
//    - SQS retries up to max receives, then DLQ
```

### Lease details
```typescript
const leaseEnd = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
const condition = 'attribute_not_exists(leaseUntil) OR leaseUntil < :now';
const updateExpr = 'SET leaseUntil = :leaseEnd';
```

The lease column (`leaseUntil`) is added only to the users table schema; it is not exposed through the profile API.

---

## Failure handling

| Failure scenario | Outcome |
| --- | --- |
| Worker Lambda timeout (300 s) | SQS visibility timeout expires, message becomes visible again, retry counted. |
| Worker crashes (unhandled error) | Same as timeout: retry after visibility timeout. |
| Worker throws after sending digest but before stamping `sentAt` | Message retried; second worker's lease claim fails (lease still valid), so no duplicate scrape. `sentAt` stamp may be missing; match goes out in next successful run (already safe). |
| All retries exhausted | Message moves to DLQ. CloudWatch alarm fires when DLQ has messages. |
| Duplicate message for same user (e.g., visibility timeout + next tick) | Second worker's lease claim fails; exits early, no duplicate work. |

**Dead‑letter queue use:**
- Operators inspect DLQ messages, see `userId` and approximate failure reason from CloudWatch Logs.
- Redrive via AWS Console or CLI to retry specific users.
- DLQ retention (14 days) gives time to diagnose.

---

## Integration with existing code

**Minimal changes:**
- `runSchedulerPipelineForUser` remains exactly as `06‑email‑optimization` left it.
- `deliverDigest` unchanged; it already handles skip/fail results without throwing.
- `advanceUserSchedule` unchanged; it still writes `lastRunAt`, `nextRunAt`, and GSI1 key.

**Dispatcher (`src/modules/schedulerModule/dispatcher`):**
- New file `enqueueDueUsers.ts` with SQS send logic.
- Original `dispatcher.ts` kept for rollback (rename to `dispatchDirect.ts` or leave as is).
- Handler chooses which dispatcher to use based on an environment variable `SCHEDULER_MODE` (`direct` | `queue`).

**Worker (`src/modules/schedulerModule/worker`):**
- New module with `claimUserLease`, `runUserPipelineFromQueue`.
- Same shared dependencies as `runSchedulerPipelineForUser`.

---

## IAM permissions

**Dispatcher role adds:**
- `sqs:SendMessage` to `arn:aws:sqs:us-east-1:*:job-scout-${stage}-user-runs`

**Worker role adds:**
- `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:ChangeMessageVisibility` on same queue
- `dynamodb:UpdateItem` on users table with condition on `leaseUntil` (already has UpdateItem)

**Existing permissions:** unchanged for Bedrock, SES, DynamoDB, S3.

---

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `USER_RUNS_QUEUE_URL` | SQS queue URL | (deployed) |
| `USER_RUNS_DLQ_URL` | DLQ URL | (deployed) |
| `WORKER_RESERVED_CONCURRENCY` | Max parallel workers | 2 |
| `LEASE_DURATION_MINUTES` | How long a lease lasts | 10 |
| `SCHEDULER_MODE` | `direct` (old) or `queue` (new) | `queue` |

---

## Deployment

1. **Create SQS resources** via Serverless Framework (`resources/` section).
2. **Add worker Lambda** to `schedulerModule/index.ts`.
3. **Update dispatcher** to use queue when `SCHEDULER_MODE=queue`.
4. **Deploy** (zero‑downtime: queue starts empty, old dispatcher still works).
5. **Switch mode** by setting `SCHEDULER_MODE=queue` and redeploying dispatcher.

**Rollback:** set `SCHEDULER_MODE=direct`, redeploy dispatcher. Messages already in queue continue to be processed by workers; new ticks go direct.

---

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Duplicate Bedrock evaluation | Extra cost, user sees duplicate reason | Lease claim prevents parallel runs; conditional match write (`attribute_not_exists(PK)`) prevents overwriting `sentAt`. |
| Lease stuck after crash | User skipped until lease expires | Lease duration (10 min) << tick interval (1 hour). Next tick's enqueue will succeed because lease expired. |
| Queue backlog grows | Users wait longer than their interval | Monitor queue age metric; increase reserved concurrency if needed. |
| Worker timeout (5 min) too short for slow scrape | Message retried repeatedly, eventually DLQ | Keep timeout; DLQ alerts operator to investigate slow portal. |
| Reserved concurrency too high | Hits SES sandbox 200‑email/day cap | Start with 2; adjust based on actual email volume. |

---

## Out of scope for this plan

- **Step Functions Map state:** visual but heavier; SQS is standard AWS fan‑out.
- **User‑specific retry delays:** all users share the same queue backoff.
- **Priority queue:** users processed in enqueue order, not by how overdue.
- **Manual run via queue:** still uses `PUT /me/schedule` with `nextRunAt = now`.
