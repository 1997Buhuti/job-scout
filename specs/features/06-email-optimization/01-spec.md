# Feature: Email Optimization — Spec (What & Why)

**Feature slug:** `06-email-optimization`
**App:** Job Scout
**Related schema:** [../../02-database-schema.md](../../02-database-schema.md) (`UserProfile`, `MatchResult`)
**Related features:** [../02-job-scheduler/01-spec.md](../02-job-scheduler/01-spec.md) (digest pipeline), [../03-auth-profile/01-spec.md](../03-auth-profile/01-spec.md) (profile and email claim), [../05-preferences/01-spec.md](../05-preferences/01-spec.md) (digest frequency)

---

## Problem / context

The digest email works, but four problems block real users.

1. **Digests land in spam.** SES sends as `alistoair1997@gmail.com`, a Gmail address. Gmail signs its own mail, so mail that claims a Gmail sender but is signed by `amazonses.com` fails sender alignment and is filtered. A domain identity, `jobscout.dynv6.net`, exists in SES, but its DNS records were never published. Verification and DKIM are both `FAILED`.
2. **The account is in the SES sandbox.** Sandbox delivers only to verified addresses and allows 200 emails per day. Every new user is an unverified recipient, so their digest is rejected. Production access is a request to AWS and has not been made.
3. **A failed send loses the digest.** Matches are saved before the email is sent. If SES rejects the email, the matches stay without `sentAt`. The scheduler spec (FR-4) treats any saved match as "already suggested", so those matches are skipped on later runs and never emailed. The failed run also leaves the schedule unadvanced, so the hourly dispatcher retries and scores more jobs each time.
4. **The email is not production ready.** It has only an HTML part, the reasoning text is long and contains filler, and there is no unsubscribe link or bounce and complaint handling. AWS expects the last two before it grants production access.

A fifth issue affects delivery: a profile gets its `email` from the Cognito token only when the record is first created. Profiles created before that field existed never receive one, and nothing backfills them.

This feature fixes sender identity, recipient handling in sandbox mode, failure recovery, message quality, and the groundwork for production access.

---

## Goals

1. Digests are sent from an address on a domain owned by the project, with SPF, DKIM, and DMARC passing.
2. Adding a sender domain to SES is a repeatable tool, not manual console work.
3. While the account is in sandbox, new users can be verified as recipients without manual SES steps, and an unverified recipient never breaks a pipeline run.
4. A failed or skipped send never loses a digest. Unsent qualifying matches go out in the next successful digest.
5. The email is concise, has HTML and plain-text parts, and includes an unsubscribe link.
6. Bounces and complaints are recorded and stop further sends to that address.
7. Every profile has an `email`.
8. The system is ready to request SES production access, and the sandbox-only behaviour switches off when production access is granted.

---

## Functional requirements

### FR-1 — Sender domain setup tool

- A repeatable command adds a sending domain to SES: `ses:add-domain <domain>`.
- It creates the SES domain identity with Easy DKIM (RSA 2048).
- It prints every DNS record the domain owner must publish: the three DKIM `CNAME` records and a DMARC `TXT` record. If a custom MAIL FROM subdomain is configured, it also prints the `MX` and SPF `TXT` records for it.
- A second command, `ses:check-domain <domain>`, reports verification status, DKIM status, and whether the domain is ready to send.
- Running either command for a domain that already exists must not fail. It reports the current state.
- If an identity is stuck in `FAILED` because its records were never published, the tool explains how to restart verification.
- The commands are operator tools. They are not exposed through the user API.

### FR-2 — Sender address configuration

- `SES_FROM_ADDRESS` must be an address on a verified domain before the pipeline sends in production.
- The pipeline refuses to send, and logs why, if the sender's domain is not verified in SES.
- Changing the sender is a configuration change, not a code change.

### FR-3 — Recipient verification in sandbox mode

- A configuration flag, `SES_SANDBOX_MODE`, tells the system the account is in sandbox. When it is `false`, FR-3 does nothing.
- In sandbox mode, when a profile is created, the system asks SES to verify that user's email as a recipient identity. SES sends the user a verification email.
- The profile stores `emailVerificationStatus`: `NOT_REQUESTED`, `PENDING`, or `VERIFIED`.
- Before sending a digest in sandbox mode, the pipeline refreshes the status from SES for any user not yet `VERIFIED`.
- A user whose status is not `VERIFIED` is skipped for sending. The run still completes. See FR-4.
- The profile page shows a short notice while the status is `PENDING`: check your inbox for a verification email.
- Already-verified or already-requested addresses are not requested again.

### FR-4 — Digest recovery and send failures

- A digest includes every qualifying match (score at or above the threshold) that has no `sentAt`, not only matches created in the current run.
- A match gets `sentAt` only after SES accepts the email.
- A skipped send (unverified, suppressed, or unsubscribed) is not an error. The run completes, matches stay unsent, and the skip is logged with the reason.
- A permanent send failure (for example a rejected address) completes the run and advances the schedule. The matches stay unsent and are included in the next digest.
- A transient send failure (throttling or a service error) is retried. The number of retries is limited. See the open question on schedule advancement.
- This changes how the scheduler spec's "already suggested" rule is applied to sending. A saved match still blocks a second Bedrock evaluation. A saved match without `sentAt` still qualifies for a digest.

### FR-5 — Message content

- The email has an HTML part and a plain-text part with the same content.
- Each match shows title, company, link, score, and a short reason.
- The Bedrock prompt asks for a reason of one or two sentences, at most 200 characters, without restating the score or commenting on the company name or location. The 300 output-token cap in the scheduler spec is unchanged.
- The subject states the match count, as it does today.
- Digest HTML escapes all job-derived text. Job URLs are written only if they use `http` or `https`.

### FR-6 — Unsubscribe

- Every digest contains an unsubscribe link and a `List-Unsubscribe` header, including the one-click variant.
- The link carries a signed, expiring token for one user. It needs no login.
- Following a valid link sets `schedulerEnabled` to `false` for that user and shows a confirmation page.
- An invalid or expired token changes nothing and returns a clear error.
- The profile page continues to be the way to turn the scheduler back on.

### FR-7 — Bounces and complaints

- SES sends events for bounces and complaints to a handler through a configuration set.
- A permanent bounce or a complaint sets `emailSuppressed` to `true` on the matching profile, with a reason and timestamp.
- The pipeline does not send to a suppressed profile and logs the skip.
- Transient bounces do not suppress.
- Suppression is cleared only when the user changes their email address or an operator clears it.

### FR-8 — Email backfill

- `GET /me/profile` writes the Cognito `email` claim to the profile when the stored email is missing or differs from the claim.
- The existing user record, which has no email, is repaired by its next profile read.
- A changed email resets `emailVerificationStatus` to `NOT_REQUESTED` and clears suppression.

### FR-9 — Production access readiness

- The system documents the evidence AWS asks for in a production access request: use case, opt-in method, unsubscribe handling, and bounce and complaint handling.
- The production access request is made only after FR-1, FR-6, and FR-7 are working.
- After access is granted, `SES_SANDBOX_MODE` is set to `false` and FR-3 stops running.

---

## Non-goals

- Marketing or promotional email, newsletters, or campaigns.
- Inbound email processing.
- A template editor or per-user email design.
- Per-user send times. The scheduler's cadence still decides when digests go out.
- Third-party email providers. SES stays the only sending service.
- Making the SES production access decision for the project. AWS decides.
- Fixing portal scraping failures such as the ITPro `403` from Lambda.

---

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | `ses:add-domain` for a new domain creates the SES identity with DKIM and prints the DNS records. Running it again for the same domain does not fail and reports the current state. |
| AC-2 | `ses:check-domain` reports `PENDING`, `SUCCESS`, or `FAILED` for verification and DKIM, and says whether the domain can send. |
| AC-3 | With a verified domain and a sender on that domain, a digest delivered to Gmail shows SPF, DKIM, and DMARC all passing in the message headers. (Manual check.) |
| AC-4 | The pipeline refuses to send, with a logged reason, when the sender's domain is not verified in SES. |
| AC-5 | In sandbox mode, creating a profile requests SES verification for the user's email and stores `emailVerificationStatus: PENDING`. After the user clicks the SES link and the next status refresh runs, it is `VERIFIED`. |
| AC-6 | In sandbox mode, a due user who is not `VERIFIED` does not cause a failed run. No SES send is attempted, no match gets `sentAt`, and the skip is logged. |
| AC-7 | With `SES_SANDBOX_MODE=false`, no recipient verification calls are made. |
| AC-8 | Qualifying matches without `sentAt` from earlier runs appear in the next successful digest, once. |
| AC-9 | A match that has `sentAt` never appears in a later digest. |
| AC-10 | A match gets `sentAt` only after SES accepts the email. When SES rejects the email, no match is stamped. |
| AC-11 | The digest has HTML and plain-text parts. Each reason is at most 200 characters. |
| AC-12 | The digest has an unsubscribe link and `List-Unsubscribe` headers. A valid link sets `schedulerEnabled` to `false`. An invalid or expired token changes nothing. |
| AC-13 | A permanent bounce or complaint sets `emailSuppressed`, and later runs skip that user with a logged reason. A transient bounce does not suppress. |
| AC-14 | A profile with no stored email gets one from the Cognito claim on its next `GET /me/profile`. |
| AC-15 | The production access request is submitted only after AC-3, AC-12, and AC-13 pass. |

---

## Constraints

- **AWS only:** SES, SNS, Lambda, DynamoDB, API Gateway. No third-party email or DNS services in the application path.
- **SDK:** AWS SDK v3. SES v2 operations need `@aws-sdk/client-sesv2`.
- **Region:** `us-east-1`.
- **Cost:** SES costs about $0.10 to $0.16 per 1,000 emails, and the daily digest limit keeps volume low. SNS and Lambda for bounce handling add pennies. The feature adds no always-on resources.
- **Bedrock:** The 300 output-token cap and the allowed model are unchanged.
- **Security:** Lambda roles get only the SES actions they use. Unsubscribe tokens are signed with a secret held in SSM Parameter Store, not in code. The sandbox cap of 200 emails a day still applies until production access is granted.
- **Backward compatibility:** Profiles without the new fields behave as `NOT_REQUESTED` and not suppressed.

---

## Open questions

1. **DNS host.** Can the DNS host for `jobscout.dynv6.net` publish `CNAME`, `TXT`, and `MX` records? If not, a different domain is needed.
2. **Schedule on transient failure.** After a transient send failure, should the schedule advance (the user waits one interval for the retry) or stay put (the hourly tick retries and re-scrapes)? The plan recommends advancing for permanent failures and a bounded retry for transient ones.
3. **Verification trigger.** Should recipient verification start when the profile is first created (simple, same stack) or from a Cognito post-confirmation hook (earlier, but a second deployment unit)? The plan recommends the first.
4. **Sender name.** Which local part: `digest@`, `noreply@`, or something else?
5. **Verification email.** Is the default AWS verification email acceptable for beta users, or should a custom SES template be set up?

---

## Dependencies

- `02-job-scheduler`: owns the digest pipeline and the "already suggested" rule that FR-4 refines.
- `03-auth-profile`: owns the profile API and the Cognito email claim used by FR-8.
- `05-preferences`: owns `schedulerEnabled` and digest frequency, which unsubscribe changes.
- A DNS host that the project controls, for FR-1.
