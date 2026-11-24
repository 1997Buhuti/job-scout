# Feature: Email Optimization — Tasks

**Spec:** [01-spec.md](01-spec.md)
**Plan:** [02-plan.md](02-plan.md)

Status key: `[ ]` not started, `[x]` done. Task IDs: **D** = docs, **S** = sender domain, **R** = recipient verification, **M** = delivery pipeline, **C** = content, **U** = unsubscribe, **E** = bounce and complaint events, **F** = frontend, **P** = production access, **V** = verification.

Complete the open questions in the spec before starting the tasks that depend on them: S5 depends on question 1, M3 on question 2, R1 on question 3, and S6 on question 4.

---

## D — Documentation

- [ ] **D1.** Add `emailVerificationStatus`, `emailSuppressed`, `emailSuppressedReason`, and `emailSuppressedAt` to `UserProfile` in `specs/02-database-schema.md`, and describe the unsent-match query.
- [ ] **D2.** Update `specs/features/02-job-scheduler/01-spec.md` FR-4 and AC-6 to point at FR-4 of this spec, so the "already suggested" rule and the digest rule do not appear to conflict.

## S — Sender domain

- [x] **S1.** Add `@aws-sdk/client-sesv2` to the backend dependencies.
- [x] **S2.** Create `backend/scripts/ses/addDomain.ts`: create the domain identity with DKIM, tolerate an existing identity, print the DNS records. Covers FR-1, AC-1.
- [x] **S3.** Create `backend/scripts/ses/checkDomain.ts`: print verification status, DKIM status, sending readiness, and missing records. Covers AC-2.
- [x] **S4.** Add the `ses:add-domain` and `ses:check-domain` scripts to `backend/package.json`.
- [x] **S5.** Publish the DNS records for the chosen domain at its DNS host (manual), then run `ses:check-domain` until it reports ready. If the existing `jobscout.dynv6.net` identity is stuck in `FAILED`, recreate it first.
- [ ] **S6.** Set `SES_FROM_ADDRESS` (and its SSM parameter) to an address on the verified domain and redeploy.
- [x] **S7.** ~~Unit tests for the record formatting in S2 and S3.~~ Dropped: these are operator scripts wrapping two SES calls. They are checked by running them against the real account in S5.

## R — Recipient verification (sandbox)

- [ ] **R1.** Add `SES_SANDBOX_MODE` to `serverless.ts` environment and `.env.example`. Default `true` until production access is granted.
- [ ] **R2.** Add the profile fields and defaults, and return `emailVerificationStatus` and `emailSuppressed` from `GET /me/profile`. Clients must not be able to write them through `PUT /me/profile`.
- [ ] **R3.** Create `emailModule/recipientStatus.ts`: request verification (`CreateEmailIdentity`), read status (`GetEmailIdentity`), and map to `NOT_REQUESTED`, `PENDING`, or `VERIFIED`. Do nothing when `SES_SANDBOX_MODE` is false. Covers AC-5, AC-7.
- [ ] **R4.** Call the verification request when `getProfile` creates a profile. A failure is logged and retried on the next profile read, and never fails the request.
- [ ] **R5.** Backfill: `getProfile` writes the Cognito `email` claim when the stored email is missing or differs, and resets verification and suppression on a change. Covers FR-8, AC-14.
- [ ] **R6.** Unit tests for R3 to R5, including: unchanged email, changed email, and a profile created before the email field existed.
- [ ] **R7.** Add the `ses:CreateEmailIdentity` and `ses:GetEmailIdentity` permissions to the Lambda role in `serverless.ts`.

## M — Delivery pipeline

- [ ] **M1.** Create `emailModule/senderCheck.ts`. Refuse to send when the sender domain is not verified, with a logged reason. Covers AC-4.
- [ ] **M2.** Create `emailModule/deliverDigest.ts` with the order of checks from the plan: unsent matches, suppressed, unsubscribed, sender, recipient, send. Return a result that names the skip or failure reason.
- [ ] **M3.** Query a user's qualifying matches that have no `sentAt`, and include them with the run's new matches. Stamp `sentAt` only after SES accepts the email. Covers AC-8, AC-9, AC-10.
- [ ] **M4.** Update `runSchedulerPipelineForUser` to call `deliverDigest`, advance the schedule for skips and permanent or retried-out failures, and keep the dependency-injection pattern.
- [ ] **M5.** Add bounded retry for transient SES errors.
- [ ] **M6.** Unit tests for M1 to M5: unverified recipient skip (AC-6), rejected send leaves matches unstamped, an old unsent match appears in the next digest once, a stamped match never reappears, and a skip does not fail the run.
- [ ] **M7.** Scope `ses:SendEmail` to the verified sender identity in `serverless.ts` once S5 is done.

## C — Content

- [ ] **C1.** Create `emailModule/buildDigest.ts` with HTML and plain-text bodies. Move the escaping from `sendDigest.ts` and allow only `http` and `https` job links. Covers FR-5.
- [ ] **C2.** Update the Bedrock prompt in `evaluateJobs.ts` to ask for a reason of one or two sentences, at most 200 characters, without comments about company name or location. Keep `maxTokens` at 300. Truncate any longer reason to 200 characters when saving.
- [ ] **C3.** Switch sending to SES v2 `SendEmail` with both bodies and headers.
- [ ] **C4.** Unit tests for C1 to C3: escaping, link scheme check, text and HTML parity, and reason length. Covers AC-11.
- [ ] **C5.** Update `evaluateJobs.test.ts` for the prompt and truncation changes.

## U — Unsubscribe

- [ ] **U1.** Store the signing secret in SSM Parameter Store and read it at cold start.
- [ ] **U2.** Create `emailModule/unsubscribeToken.ts`: sign and verify an HMAC token containing the user ID and a 30-day expiry.
- [ ] **U3.** Add the `unsubscribe` Lambda and a public `GET /unsubscribe` route. A valid token sets `schedulerEnabled` to `false` and returns a confirmation page. An invalid or expired token changes nothing and returns an error page. Covers AC-12.
- [ ] **U4.** Add the unsubscribe link and `List-Unsubscribe` headers (including one-click) to the digest.
- [ ] **U5.** Unit tests for U2 and U3: valid, tampered, expired, and missing tokens.

## E — Bounces and complaints

- [ ] **E1.** Create an SES configuration set, an SNS topic, and a bounce and complaint event destination in `serverless.ts` resources. Attach the configuration set to digest sends.
- [ ] **E2.** Add a GSI on the users table keyed by `email`. This is an infrastructure change. Record the choice if a scan is used instead.
- [ ] **E3.** Create the `handleSesEvent` Lambda: on a permanent bounce or a complaint, set `emailSuppressed`, the reason, and the timestamp. Ignore transient bounces. Covers FR-7, AC-13.
- [ ] **E4.** Make `deliverDigest` skip suppressed profiles with a logged reason.
- [ ] **E5.** Unit tests for E3: permanent bounce, transient bounce, complaint, and unknown address.

## F — Frontend

- [ ] **F1.** Extend the profile types and service for the read-only `emailVerificationStatus` and `emailSuppressed`.
- [ ] **F2.** Show the "check your inbox" notice in `features/profile/components/` while the status is `PENDING`. Do not place it in `components/` or `app/`.

## P — Production access

- [ ] **P1.** Write the production access request: use case, how addresses are collected, unsubscribe handling, and bounce and complaint handling. Keep it in the repository as a document.
- [ ] **P2.** Submit the request only after V1 to V4 pass. Covers AC-15.
- [ ] **P3.** When access is granted, set `SES_SANDBOX_MODE` to `false`, redeploy, and confirm no recipient verification calls are made. Covers AC-7.

## V — Verification

- [ ] **V1.** Run the backend Jest suite and confirm all new and existing tests pass. Run `npm run compile` and `npm run lint`.
- [ ] **V2.** Send a real digest from the verified domain to a Gmail address and check the original message headers for SPF, DKIM, and DMARC passes. Record where it landed. Covers AC-3.
- [ ] **V3.** Click the unsubscribe link in a real digest and confirm the scheduler is disabled. Covers AC-12.
- [ ] **V4.** Send a test to the SES bounce simulator address and confirm the profile is suppressed. Covers AC-13.
- [ ] **V5.** Check each acceptance criterion AC-1 to AC-15 and record what was checked and what could not be verified.
- [ ] **V6.** Remove any temporary files and test records created during verification, including test profile edits.
