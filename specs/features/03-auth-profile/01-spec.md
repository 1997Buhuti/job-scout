# Feature: Auth & Profile â€” Spec (What & Why)

**Feature slug:** `03-auth-profile`  
**App:** Job Scout  
**Related schema:** [../../02-database-schema.md](../../02-database-schema.md) (`UserProfile`)  
**Related overview:** [../../00-project-overview.md](../../00-project-overview.md) (User registration & profile)

---

## Problem / context

CV upload, scheduling, and match digests all require a known user. Job Scout must let people sign up / sign in with Amazon Cognito (via Amplify Gen 2), persist a `UserProfile` in DynamoDB keyed by Cognito Sub, and edit basic profile fields (especially `targetRoles`) before later features run.

---

## Goals

1. Users can **sign up** and **sign in** with Cognito (email + password for MVP).
2. After first authenticated access, a **`UserProfile`** row exists (or is created) for that user.
3. Authenticated users can **read and update** their profile (`email`, `targetRoles`).
4. Downstream APIs can trust `userId` = Cognito Sub from a JWT authorizer.

---

## Functional requirements

### FR-1 â€” Cognito authentication (Amplify Gen 2)

- Frontend uses Amplify Gen 2 auth (Cognito User Pool) for sign-up, sign-in, and sign-out.
- MVP auth method: **email + password**. Email verification may follow Cognito defaults / Amplify Gen 2 recommendations.
- Unauthenticated users cannot call protected profile APIs (`401`).
- `userId` for all app data is the Cognito **Sub** ID.

### FR-2 â€” UserProfile persistence

- On first successful authenticated profile access (or explicit bootstrap), create a DynamoDB `UserProfile` if missing.
- Required fields on create (see schema):
  - `userId` (Cognito Sub)
  - `email` (from Cognito / ID token claims)
  - `targetRoles` (default `[]`)
  - `scheduleIntervalDays` (default `7` â€” weekly; scheduler UI owned by `02-job-scheduler`)
  - `schedulerEnabled` (default `false`)
  - `createdAt` / `updatedAt` (ISO-8601)
- Optional until later features: `cvS3Key`, `lastRunAt`, `nextRunAt`.

### FR-3 â€” Profile read API

- Authenticated `GET /me/profile` returns the callerâ€™s `UserProfile` (or creates-then-returns on first call).
- Response must include at least: `userId`, `email`, `targetRoles`, `scheduleIntervalDays`, `schedulerEnabled`, timestamps, and `cvS3Key` when set.

### FR-4 â€” Profile update API

- Authenticated `PUT /me/profile` (or `PATCH`) updates allowed fields.
- MVP writable fields: `targetRoles` (string array).
- `email` is read-only from Cognito for MVP (display only; changing email via Cognito is out of scope).
- Reject empty-string role entries after trim; max **10** roles; each role max **80** characters.
- Do **not** allow clients to set `userId`, `cvS3Key`, or scheduler run timestamps in this feature.

### FR-5 â€” Profile settings UI

- Signed-out users see sign-up / sign-in UI.
- Signed-in users can open a profile / settings view to edit `targetRoles` and save via the profile API.
- Show current email (read-only) and clear success / validation / auth errors.

---

## Non-goals

- Social / federated IdPs (Google, GitHub, etc.).
- Password reset / MFA UX beyond what Amplify provides out of the box (may use Amplify defaults; custom flows later).
- CV upload UI or S3 wiring (owned by `01-cv-upload`).
- Scheduler enable / interval UI (owned by `02-job-scheduler`).
- Admin roles, multi-tenant orgs, or RBAC beyond â€œauthenticated user owns their profileâ€.
- Storing CV text or Bedrock results on the profile in this feature.

---

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | New user can sign up and sign in via Amplify Cognito on the frontend. |
| AC-2 | Signed-in `GET /me/profile` returns `200` with `userId` equal to Cognito Sub. |
| AC-3 | First `GET /me/profile` for a new user creates a DynamoDB `UserProfile` with defaults (`targetRoles: []`, `schedulerEnabled: false`, `scheduleIntervalDays: 7`). |
| AC-4 | Unauthenticated `GET` / `PUT /me/profile` returns `401`. |
| AC-5 | `PUT /me/profile` with valid `targetRoles` persists them; subsequent `GET` returns the same values. |
| AC-6 | Invalid `targetRoles` (empty strings, >10 items, item >80 chars) returns `400`. |
| AC-7 | Profile settings UI lets a signed-in user edit and save `targetRoles` and shows read-only email. |

---

## Constraints

- **AWS only:** Cognito, Amplify Gen 2, API Gateway, Lambda, DynamoDB. No Auth0 / Clerk / Supabase Auth / Firebase Auth.
- **SDK:** AWS SDK v3 for DynamoDB (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`).
- **Region:** `us-east-1`.
- **Backend runtime (repo):** Serverless Framework v4, Node.js `24.x` (align with current `backend/serverless.ts`).
- **Budget:** Cognito free tier / on-demand DynamoDB; no per-user always-on resources.
- **Branch:** `feature/03-auth-profile` per [../00-branching-cicd/01-spec.md](../00-branching-cicd/01-spec.md).

