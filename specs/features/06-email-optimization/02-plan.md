# Feature: Email Optimization — Plan (How)

**Feature slug:** `06-email-optimization`
**Spec:** [01-spec.md](01-spec.md)
**Tasks:** [03-tasks.md](03-tasks.md)

---

## Approach

Email work is split into five independent parts, built in this order:

1. **Sender domain tooling.** Operator scripts that add a domain to SES, print the DNS records, and check status. This unblocks the spam fix.
2. **Pipeline send path.** Move the send logic into a small email module that checks sender, recipient, and suppression before sending, and that includes unsent matches in each digest.
3. **Recipient verification (sandbox only).** Request SES verification when a profile is created, track status on the profile, and skip unverified users without failing the run.
4. **Message quality and unsubscribe.** Multipart message, shorter reasons, and a signed unsubscribe link.
5. **Bounces and complaints.** SES configuration set, SNS topic, and a handler that suppresses addresses.

Part 1 and the digest recovery in part 2 fix today's two real problems (spam and lost digests) and need no new infrastructure.

---

## Design decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Domain setup | Node scripts under `backend/scripts/ses/` calling SES v2 | Repeatable, reviewable, no console clicking. Not exposed as an API because it changes account-level identity. |
| SES client | Add `@aws-sdk/client-sesv2` for identity, status, and sending with headers | SES v2 has `CreateEmailIdentity`, `GetEmailIdentity`, and header support. The existing `@aws-sdk/client-ses` stays only until sending is migrated. |
| Recipient verification trigger | When the profile is created in `getProfile` | Same stack and IAM role as the rest of the backend. The Cognito post-confirmation hook would be a second deployment unit in Amplify. Recommended answer to open question 3. |
| Verification status source | SES `GetEmailIdentity`, cached on the profile | SES is the source of truth. Caching avoids a call per run once `VERIFIED`. |
| Unverified recipient | Skip the send, complete the run | A rejected send currently fails the whole run and wastes Bedrock spend on retries. |
| Digest contents | All qualifying matches with no `sentAt` | Makes any failed or skipped send recoverable, with no manual repair. |
| Schedule on send failure | Advance on permanent failure, bounded retry on transient | Avoids hourly re-scrapes. Recommended answer to open question 2. |
| Suppression | `emailSuppressed` on the profile, set by an SNS-driven Lambda | Users are looked up by email through a lookup on the users table. See data model. |
| Unsubscribe token | HMAC-signed token with user ID and expiry, secret in SSM | No login needed and no token storage. |
| Sandbox switch | `SES_SANDBOX_MODE` environment variable | Turns recipient verification off with a configuration change once production access is granted. |

---

## Architecture

```text
Operator machine
  └─ ses:add-domain / ses:check-domain ──► SES domain identity (DKIM)
                                           DNS host (records published by hand)

EventBridge (hourly) ─► schedulerDispatcher ─► runSchedulerPipelineForUser
                                                 1. scrape, filter, evaluate (unchanged)
                                                 2. emailModule.deliverDigest
                                                      - check sender domain verified
                                                      - check suppressed / unsubscribed
                                                      - sandbox: refresh recipient status
                                                      - collect unsent qualifying matches
                                                      - SES v2 SendEmail (HTML + text + headers)
                                                      - stamp sentAt on success
                                                 3. advance schedule

GET /me/profile (first read) ─► create profile ─► [sandbox] CreateEmailIdentity(recipient)
                                └─ backfill email from the JWT claim when missing or changed

SES event (bounce / complaint) ─► SNS topic ─► handleSesEvent Lambda ─► set emailSuppressed

GET /unsubscribe?token=...  ─► verify signature and expiry ─► schedulerEnabled = false
```

---

## API and Lambda contracts

### Operator scripts

| Command | Behaviour |
| --- | --- |
| `npm run ses:add-domain -- <domain>` | Calls `CreateEmailIdentity` for the domain with DKIM `RSA_2048_BIT`. If it already exists, reads it instead. Prints the DNS records to publish. |
| `npm run ses:check-domain -- <domain>` | Calls `GetEmailIdentity`. Prints verification status, DKIM status, `VerifiedForSendingStatus`, and the missing records. |

Both read the profile name from `AWS_PROFILE` and use `us-east-1`. Records printed:

- Three DKIM `CNAME` records: `<token>._domainkey.<domain>` pointing to `<token>.dkim.amazonses.com`.
- DMARC `TXT` at `_dmarc.<domain>`: `v=DMARC1; p=none; rua=mailto:<operator address>` to start.
- Optional custom MAIL FROM: `MX` and SPF `TXT` for the MAIL FROM subdomain.

A `FAILED` identity may need to be deleted and recreated to restart verification. The script prints that guidance and does not delete anything itself.

### Lambdas and routes

| Name | Trigger | Purpose |
| --- | --- | --- |
| `handleSesEvent` | SNS | Marks the address suppressed on a permanent bounce or complaint. |
| `unsubscribe` | `GET /unsubscribe` on the HTTP API, no authorizer | Verifies the token and disables the scheduler for that user. |

`GET /unsubscribe` is public by design. It does only one thing, and only for a valid signed token. It returns a small HTML page.

### Pipeline module

Add `backend/src/modules/emailModule/` with:

- `deliverDigest.ts`: orchestrates the checks and the send.
- `senderCheck.ts`: confirms the sender domain is verified (cached per Lambda container).
- `recipientStatus.ts`: reads and refreshes `emailVerificationStatus`.
- `buildDigest.ts`: builds the HTML and plain-text bodies. Moves the escaping logic from `sendDigest.ts` and adds an `http` / `https` check on job URLs.
- `unsubscribeToken.ts`: signs and verifies tokens.

`runSchedulerPipelineForUser` calls `deliverDigest` in place of `sendDigestForUser`. Its dependency-injection style is kept, so tests need no AWS.

---

## Data model impact

New optional fields on `UserProfile`. Missing fields read as the defaults.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `emailVerificationStatus` | `'NOT_REQUESTED' \| 'PENDING' \| 'VERIFIED'` | `NOT_REQUESTED` | Only used in sandbox mode. |
| `emailSuppressed` | `boolean` | `false` | Set by `handleSesEvent`. |
| `emailSuppressedReason` | `'BOUNCE' \| 'COMPLAINT'` | none | |
| `emailSuppressedAt` | ISO-8601 string | none | |

`MatchResult` is unchanged. `sentAt` keeps its meaning but is now also the marker for "unsent" when absent.

Finding matches without `sentAt` for one user uses the existing matches table GSI (`gsi1pk = USER#{userId}`) with a filter on `sentAt`. Match counts per user stay small, so a filtered query is enough and no new index is added.

`handleSesEvent` needs to find a profile by email. The events carry the address, not the user ID. The simplest option is a new GSI on the users table keyed by `email`. This is an infrastructure change and is listed in the tasks. If a GSI is unwanted at this stage, the handler can scan the table, which is acceptable only while the user count is small.

`02-database-schema.md` must be updated with these fields.

---

## Pipeline behaviour

`deliverDigest` runs after Bedrock evaluation, in this order:

1. Collect qualifying matches for the user with no `sentAt` (this run's new matches plus older unsent ones). If none, return without sending.
2. If the profile is `emailSuppressed`, log and return `skipped: suppressed`.
3. If the scheduler is disabled (unsubscribed), return `skipped: unsubscribed`.
4. If `SES_FROM_ADDRESS`'s domain is not verified for sending, log an error and return `skipped: sender-unverified`.
5. If `SES_SANDBOX_MODE` is true and the status is not `VERIFIED`, refresh it from SES. If still not `VERIFIED`, return `skipped: recipient-unverified`.
6. Send through SES v2 with HTML, text, and the unsubscribe headers.
7. On acceptance, stamp `sentAt` on each included match. On a permanent error, log and return `failed: permanent`. On a transient error, retry up to a small fixed count, then return `failed: transient`.

The caller advances the schedule for `skipped` and `failed: permanent`. For `failed: transient` after retries it also advances, so a run never retries scraping every hour. Matches stay unsent either way and go out in the next digest. This is the recommended answer to open question 2.

---

## Frontend mapping

- Profile page shows a notice for `emailVerificationStatus: PENDING`: "Check your inbox for a message from Amazon Web Services and click the link so Job Scout can email you." No notice for `VERIFIED` or `NOT_REQUESTED` outside sandbox mode.
- The profile API returns `emailVerificationStatus` and `emailSuppressed` as read-only fields. Clients cannot write them.
- Code goes in `frontend/src/features/profile/components/` and `types/`, following the workspace layout rules. Nothing goes in `components/` or `app/`.

---

## Security and cost notes

- IAM for the pipeline role: `ses:SendEmail`, `ses:CreateEmailIdentity`, `ses:GetEmailIdentity`. Scope `SendEmail` to the verified sender identity ARN instead of `*` once the domain is verified.
- IAM for `handleSesEvent`: DynamoDB `Query` on the new email GSI and `UpdateItem` on the users table. It needs no SES permissions.
- Operator scripts run with the operator's own credentials. Lambdas get no domain-management or `PutAccountDetails` permission.
- The unsubscribe signing secret lives in SSM Parameter Store, read at cold start. Tokens expire after 30 days.
- The unsubscribe route accepts only a signed token and performs one fixed action. It must not echo user input into the page.
- Escape all job-derived text in the HTML body. Allow only `http` and `https` job links.
- SES cost is about $0.10 to $0.16 per 1,000 emails. SNS and Lambda for events are pennies. The sandbox cap of 200 emails a day applies until production access is granted.

---

## Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| DNS host cannot publish the required record types | Domain never verifies | Check open question 1 first. Fall back to a different domain. |
| Verification of the existing identity stays `FAILED` | Spam problem persists | The tool explains how to recreate the identity. |
| A passing DMARC check still lands in spam | Poor inbox placement | DKIM and DMARC are necessary, not sufficient. Check placement after setup and keep content plain. A new domain also needs a warm-up period. |
| AWS denies production access | Sandbox limits remain | Keep FR-3 working. Resubmit with the unsubscribe and bounce evidence. |
| Verification emails confuse beta users | Users ignore the AWS link | Profile notice from the frontend mapping. Consider a custom template later. |
| Users on the profile creation path see added latency from the SES call | Slow first profile load | Make the SES call best effort. A failure is logged and retried on the next profile read. |
| Scanning the users table for bounces | Cost and speed degrade as users grow | Add the email GSI before real users arrive. |

---

## Out of scope for this plan

- Marketing email, inbound mail, and per-user send times.
- Replacing SES.
- Scraper and Bedrock changes beyond the shorter reasoning prompt.
