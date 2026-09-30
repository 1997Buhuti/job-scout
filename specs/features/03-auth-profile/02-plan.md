# Feature: Auth & Profile â€” Plan (How)

**Feature slug:** `03-auth-profile`  
**Implements:** [01-spec.md](./01-spec.md)  
**Stack:** Serverless Framework v4 Â· Node.js 24.x Â· AWS SDK v3 Â· Next.js App Router Â· Amplify Gen 2 Â· `us-east-1`

---

## Architecture overview

```text
Next.js (Amplify Gen 2 Cognito)
  sign-up / sign-in / sign-out
        |
        |  Authorization: Bearer <Cognito ID token>
        v
API Gateway HTTP API
  Cognito JWT authorizer (User Pool)
        |
        +--> GET  /me/profile  --> Lambda: getProfile
        |         - GetItem UserProfile
        |         - if missing: PutItem with defaults
        |         - return profile
        |
        +--> PUT  /me/profile  --> Lambda: updateProfile
                  - validate targetRoles
                  - UpdateItem
                  - return updated profile
        |
        v
DynamoDB: job-scout-${stage}-users  (UserProfile)
```

Amplify owns the Cognito User Pool + App Client. Backend Serverless stack references the pool ARN / issuer for the JWT authorizer (env / SSM / Amplify outputs â€” document exact wiring in tasks; never commit secrets).

---

## Cognito & Amplify Gen 2

| Item | Detail |
| --- | --- |
| Hosting / auth | Amplify Gen 2 in `frontend/` (or Amplify backend folder as Gen 2 conventions require) |
| User Pool | Email sign-in; password policy per Cognito defaults (reasonable MVP) |
| Tokens | Frontend sends **ID token** as `Authorization: Bearer â€¦` |
| Claims used | `sub` â†’ `userId`; `email` â†’ profile email on create / display |
| Env | Amplify Console / `amplify_outputs` (or equivalent) â€” no Cognito secrets in git |

Frontend packages (expected): `aws-amplify` + Amplify UI React auth components (or minimal custom forms using Amplify Auth APIs). Prefer Amplify Authenticator for MVP speed.

---

## Backend â€” Lambda handlers

Suggested module path:

```text
backend/src/modules/profileModule/
â”œâ”€â”€ getProfile/
â”‚   â”œâ”€â”€ handler.ts
â”‚   â””â”€â”€ ...
â””â”€â”€ updateProfile/
    â”œâ”€â”€ handler.ts
    â””â”€â”€ ...
```

Shared: DynamoDB document client helper under `backend/src/common/` or `backend/src/data/` as the monorepo already patterns allow (`@data/*`, `@common/*`).

### JWT authorizer

| Item | Detail |
| --- | --- |
| Type | HTTP API JWT authorizer (Cognito) |
| Identity source | `$request.header.Authorization` |
| Audience / issuer | Cognito App Client ID + issuer URL for the User Pool in `us-east-1` |
| `userId` extraction | `event.requestContext.authorizer.jwt.claims.sub` (HTTP API shape) |

### `getProfile`

| Item | Detail |
| --- | --- |
| Trigger | `GET /me/profile` |
| Auth | Cognito JWT required |
| Logic | Resolve `userId` + email from claims â†’ `GetItem` â†’ if missing, `PutItem` defaults â†’ return profile |
| Output | `200` profile JSON (see shape below) |
| Errors | `401` unauthenticated |

**Create defaults:**

```json
{
  "userId": "<sub>",
  "email": "<email claim>",
  "targetRoles": [],
  "scheduleIntervalDays": 7,
  "schedulerEnabled": false,
  "createdAt": "<ISO>",
  "updatedAt": "<ISO>"
}
```

### `updateProfile`

| Item | Detail |
| --- | --- |
| Trigger | `PUT /me/profile` |
| Auth | Cognito JWT required |
| Input | `{ "targetRoles": string[] }` |
| Logic | Trim roles; drop empties; validate count â‰¤ 10 and length â‰¤ 80; `UpdateItem` `targetRoles` + `updatedAt` |
| Output | `200` updated profile |
| Errors | `401`; `400` validation; `404` if profile missing (or upsert â€” prefer ensure via get-or-create first) |

### Response shape (MVP)

```typescript
{
  userId: string;
  email: string;
  targetRoles: string[];
  scheduleIntervalDays: number;
  schedulerEnabled: boolean;
  cvS3Key?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## DynamoDB

| Item | Detail |
| --- | --- |
| Table | `job-scout-${stage}-users` (export `USERS_TABLE_NAME`) |
| Billing | On-demand (PAY_PER_REQUEST) |
| Keys | Prefer schema composite: `PK = USER#{userId}`, `SK = PROFILE` (see [../../02-database-schema.md](../../02-database-schema.md)) |
| Attributes | Match `UserProfile` interface |
| GSI1 | **Defer** to `02-job-scheduler` (SCHED / NEXT). Create table without GSI1 in this feature unless cheap to add empty now â€” prefer defer to avoid unused index cost |

IAM: Lambdas need `dynamodb:GetItem`, `PutItem`, `UpdateItem` on the users table ARN only.

---

## Frontend â€” Next.js UI

| Piece | Detail |
| --- | --- |
| Auth shell | Amplify Authenticator (or equivalent) wrapping app / settings routes |
| Config | Configure Amplify once from generated outputs / public env |
| API client | `fetch(`${NEXT_PUBLIC_API_URL}/me/profile`)` with ID token |
| Settings page | e.g. `frontend/src/app/(dashboard)/settings/page.tsx` (or `/profile`) |
| Roles UX | Chip/list editor: add / remove role strings; Save button; show email read-only |
| States | Loading, signed-out, save success, validation errors |

Suggested components (feature-driven — see `.cursor/rules/frontend-feature-structure.mdc`):

```text
frontend/src/features/auth/components/…     # SignInForm, AuthShell, etc.
frontend/src/features/profile/components/TargetRolesForm.tsx
frontend/src/app/(dashboard)/settings/page.tsx
frontend/src/app/providers.tsx              # Amplify bootstrap
```

---

## Serverless wiring notes

- Register `getProfile` / `updateProfile` in `backend/serverless.ts` (or profile module export).
- HTTP API + JWT authorizer resource (shared for future CV / schedule routes).
- Env: `USERS_TABLE_NAME`, Cognito issuer / audience as required by authorizer config.
- Use existing Middy wrapper / response helpers under `backend/src/common/`.
- Keep functions small; esbuild individual packaging already configured.

**Authorizer config source (MVP options â€” pick one in implementation):**

1. Amplify outputs copied into Serverless params / GitHub Environment vars for prod.  
2. CloudFormation/SSM parameter written after Amplify deploy.

Do not hardcode pool IDs in source; use env / stage params.

---

## Security & cost notes

- Never commit Cognito client secrets or `.env` with pool credentials.
- Prefer ID token validation via API Gateway authorizer (no custom JWT libs in Lambda for auth gate).
- Least-privilege DynamoDB IAM.
- On-demand table; short log retention already set at provider level.
- No third-party auth vendors.
- Profile update must not accept privilege escalation fields (`userId`, scheduler timestamps, `cvS3Key`).

---

## Dependency order for later features

```text
03-auth-profile  â†’  01-cv-upload (needs Cognito + UserProfile + table)
                 â†’  02-job-scheduler (needs profile + GSI1 + schedule API/UI)
```

CV upload and scheduler specs already assume this featureâ€™s authorizer and users table exports.

