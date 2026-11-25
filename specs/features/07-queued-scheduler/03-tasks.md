# Feature: Queued Scheduler — Tasks

**Spec:** [01-spec.md](01-spec.md)
**Plan:** [02-plan.md](02-plan.md)

Status key: `[ ]` not started, `[x]` done. Task IDs: **I** = infrastructure, **D** = dispatcher, **W** = worker, **T** = tests, **V** = verification.

---

## I — Infrastructure

- [ ] **I1.** Add `leaseUntil?: string` to `UserProfile` in `specs/02-database-schema.md`. Describe as internal worker lease, not exposed through API.
- [ ] **I2.** Add SQS queue and dead‑letter queue resources to `backend/src/serverless/resources/sqs-queues.ts`. Configuration:
  - Queue name: `job-scout-${stage}-user-runs`
  - DLQ name: `job-scout-${stage}-user-runs-dlq`
  - Visibility timeout: 350 seconds
  - Maximum receives: 3
  - DLQ message retention: 14 days
- [ ] **I3.** Add the queue resources to `serverless.ts` `resources` merge.
- [ ] **I4.** Add environment variables to `serverless.ts` provider:
  - `USER_RUNS_QUEUE_URL`: `{ Ref: 'UserRunsQueue' }`
  - `USER_RUNS_DLQ_URL`: `{ Ref: 'UserRunsDLQ' }`
  - `WORKER_RESERVED_CONCURRENCY`: `2`
  - `LEASE_DURATION_MINUTES`: `10`
  - `SCHEDULER_MODE`: `queue` (initially `direct` for safe deployment)
- [ ] **I5.** Add SQS permissions to the dispatcher Lambda role in `serverless.ts`:
  - `sqs:SendMessage` on the queue ARN.
- [ ] **I6.** Add SQS permissions to the worker Lambda role (new role):
  - `sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:ChangeMessageVisibility` on queue ARN.
  - Existing DynamoDB, Bedrock, SES, S3 permissions same as dispatcher.

## D — Dispatcher

- [ ] **D1.** Create `backend/src/modules/schedulerModule/enqueueDueUsers.ts`:
  - Function `enqueueDueUsers` that queries due users (same as `dispatchDueUsers`'s query) and sends one SQS message per user.
  - Logs count enqueued.
  - Respects `MAX_USERS_PER_DISPATCH` cap.
- [ ] **D2.** Update `schedulerModule/dispatcher/handler.ts` to call either `dispatchDueUsers` (direct) or `enqueueDueUsers` (queue) based on `SCHEDULER_MODE`.
- [ ] **D3.** Update `schedulerModule/dispatcher/dispatcher.ts`:
  - Export `queryDueUsers` separately so the enqueuer can reuse it.
  - Keep `dispatchDueUsers` unchanged for direct mode.
- [ ] **D4.** Add the new dispatcher mode to `schedulerModule/index.ts`:
  - Keep existing `schedulerDispatcher` (will switch based on env).
  - No new Lambda yet.

## W — Worker

- [ ] **W1.** Create `backend/src/modules/schedulerModule/worker/` directory.
- [ ] **W2.** Create `lease.ts` with `attemptLease(userId: string): Promise<boolean>`:
  - Conditional `UpdateItem` that sets `leaseUntil` only if absent or expired.
  - Returns `true` if lease acquired, `false` if already leased.
- [ ] **W3.** Create `handler.ts`:
  - Parses SQS message, extracts `userId`.
  - Attempts lease; if fails, logs and exits (does not delete message).
  - If lease acquired:
    - Reads fresh `UserProfile`.
    - Calls `runSchedulerPipelineForUser` with same dependencies as current dispatcher.
    - Deletes message on success.
    - Throws on error (SQS retry).
- [ ] **W4.** Create `schedulerModule/worker/index.ts` exporting the handler.
- [ ] **W5.** Add worker Lambda to `schedulerModule/index.ts`:
  - Trigger: SQS `user-runs` queue.
  - Reserved concurrency: `WORKER_RESERVED_CONCURRENCY`.
  - Timeout: 300, memory: 1024 (same as dispatcher).
- [ ] **W6.** Update `runSchedulerPipelineForUser` to clear `leaseUntil` after a successful run (optional cleanup).

## T — Tests

- [ ] **T1.** Unit test `lease.ts`: success, already leased, expired lease.
- [ ] **T2.** Unit test `enqueueDueUsers.ts` with mocked SQS.
- [ ] **T3.** Unit test worker handler:
  - Lease acquired → pipeline runs → message deleted.
  - Lease not acquired → early exit.
  - Pipeline throws → error propagated.
- [ ] **T4.** Update `dispatcher` unit tests for both modes.
- [ ] **T5.** Integration test (optional): deploy to dev, toggle mode, verify queue behavior.

## V — Verification

- [ ] **V1.** Deploy to dev stage with `SCHEDULER_MODE=direct` (no change).
- [ ] **V2.** Switch to `SCHEDULER_MODE=queue`, redeploy dispatcher.
- [ ] **V3.** Trigger a test user (set `nextRunAt` in past), confirm:
  - Message appears in queue.
  - Worker runs, sends digest, deletes message.
  - `lastRunAt`/`nextRunAt` updated.
- [ ] **V4.** Force a duplicate message (simulate visibility timeout), confirm:
  - Second worker lease fails, no duplicate scrape.
- [ ] **V5.** Force worker error (e.g., invalid Bedrock model), confirm:
  - Message retries up to 3 times, then moves to DLQ.
  - DLQ visible in AWS Console.
- [ ] **V6.** Switch back to `SCHEDULER_MODE=direct`, confirm direct dispatch still works.
- [ ] **V7.** Run full backend Jest suite, confirm all tests pass.

---

## Notes

- The worker uses the exact same `runSchedulerPipelineForUser` that `06‑email‑optimization` built, so all its skip/fail logic and SES retries apply unchanged.
- The lease column is internal; the profile API continues to return the same fields.
- CloudWatch metrics for `ApproximateNumberOfMessagesVisible` and `ApproximateAgeOfOldestMessage` give queue health.
