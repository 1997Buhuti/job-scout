# Feature: Queued Scheduler — Spec (What & Why)

**Feature slug:** `07-queued-scheduler`
**App:** Job Scout
**Related schema:** [../../02-database-schema.md](../../02-database-schema.md) (`UserProfile`)
**Related features:** [../02-job-scheduler/01-spec.md](../02-job-scheduler/01-spec.md) (original scheduler), [../06-email-optimization/01-spec.md](../06-email-optimization/01-spec.md) (digest delivery)

---

## Problem / context

The current scheduler processes users one after another in the same Lambda invocation (B4). This creates three issues as user count grows:

1. **Timeout risk:** If a user's scrape takes a long time, the 5-minute dispatcher timeout might expire before later users in the batch can run.
2. **No per-user retry isolation:** A failure that crashes the Lambda (e.g., a network or SDK error) stops all users in that tick, and the only retry path is the next hour.
3. **No dead-letter queue visibility:** Users whose runs keep failing appear only in logs, with no structured queue to inspect and redrive.

A queued architecture solves these while keeping Bedrock and SES costs bounded under the sandbox caps.

---

## Goals

1. Each due user's scheduled pipeline runs in its own Lambda invocation, isolated from timeouts of other users.
2. Individual run failures go to a dead-letter queue that operators can inspect and redrive without waiting hours.
3. The system caps parallel runs to stay under Bedrock, SES and Lambda concurrency limits.
4. The switch is transparent to users: same API, same schedule fields, same digest content.

---

## Functional requirements

### FR-1 — Dispatcher that enqueues

- Every EventBridge tick, the dispatcher queries the users due to run (same GSI1 query as B4).
- For each due user, it enqueues a `{ userId }` message on an SQS queue.
- It **does not** run any pipeline logic itself.
- It enqueues at most `MAX_USERS_PER_DISPATCH` users per tick (default 5) to stay under sandbox email caps.

### FR-2 — Worker that processes one user

- A separate Lambda function consumes messages from the queue, one per invocation.
- The worker reads the fresh `UserProfile` at the start of a run.
- It then runs the exact same pipeline steps as `runSchedulerPipelineForUser` (scrape → omit-already-suggested → evaluate → deliver digest → advance schedule).
- After a successful pipeline, it acknowledges the SQS message.

### FR-3 — Claim before work

- To prevent two workers processing the same user at once, the worker attempts to claim the user by setting a short-lived lease on the profile (e.g., `leaseUntil`).
- A duplicate message that arrives before the lease expires finds the user already claimed and exits without scraping.
- A crashed worker's lease expires; the queue's visibility timeout and retry mechanism allows another attempt.

### FR-4 — Retry and dead-letter handling

- The SQS queue has a visibility timeout longer than the worker's Lambda timeout.
- If a worker fails, the message reappears after the visibility timeout, up to a configured maximum receive count.
- After the maximum attempts, the message moves to a dead-letter queue that retains messages for 14 days.
- Operators can inspect the DLQ, see why a user keeps failing, and redrive messages.

### FR-5 — Bounded parallelism

- The worker Lambda has **reserved concurrency** set to a low number (default 2), which caps how many users run in parallel across all workers.
- This prevents hitting Bedrock or SES rate limits, and keeps the daily sandbox email count predictable.

---

## Non-goals

- **Real-time priority:** The queue processes messages in the order SQS receives them, not by how overdue each user is.
- **User-specific retry policies:** All users share the same SQS queue configuration.
- **Queue backpressure to the UI:** The UI continues to show the user's next scheduled time, not queue depth.
- **Manual runs via the queue:** The queue is triggered only by the dispatcher, not by API calls.
- **Cross-region deployment:** All infrastructure stays in `us-east-1`.

---

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | The dispatcher Lambda runs within seconds, only enqueuing messages, never calling scrape or Bedrock. |
| AC-2 | Each user due in a tick receives exactly one SQS message. |
| AC-3 | Two SQS messages for the same user arriving in the same minute do **not** cause double Bedrock evaluation or double digest. |
| AC-4 | A failed worker (Lambda timeout, crash, error) retries up to the configured maximum receive count, then moves the message to the dead-letter queue. |
| AC-5 | At most the reserved concurrency number of workers run in parallel across all users. |
| AC-6 | Disabled users (`schedulerEnabled = false`) are never enqueued, even when due. |
| AC-7 | The dead-letter queue retains messages for 14 days and is visible in the AWS Console. |

---

## Constraints

- **AWS only:** SQS, Lambda, DynamoDB, CloudWatch.
- **Cost:** The first million SQS requests per month are free. The number of messages per user run is low (< 10), so the free tier covers thousands of users.
- **SQS visibility timeout:** Must be longer than the Lambda worker timeout (5 minutes) plus a buffer.
- **Existing schema:** The change must not alter the `UserProfile` fields visible to the frontend.
- **Integration:** Must work with the existing `06-email-optimization` delivery pipeline, including sender check, recipient verification, and SES v2 sends.
- **Rollback path:** The old dispatcher code remains in Git; switching back is a configuration change.

---

## Dependencies

- `02-job-scheduler`: owns the due-user query and the `nextRunAt`/`lastRunAt` schedule fields.
- `06-email-optimization`: delivers the digest after evaluation.
- No other features depend on this queue; they call the same `runSchedulerPipelineForUser` function.
