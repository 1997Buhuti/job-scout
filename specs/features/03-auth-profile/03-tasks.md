# Feature: Auth & Profile â€” Tasks

**Feature slug:** `03-auth-profile`  
**Follow:** [01-spec.md](./01-spec.md) Â· [02-plan.md](./02-plan.md)  
**Protocol:** Execute **one** unchecked task at a time; wait for confirmation; then mark `[x]`.  
**Branch:** `feature/03-auth-profile`

---

## Specs & docs

- [x] **S1.** Author `01-spec.md` (Cognito auth, UserProfile, profile API/UI requirements)
- [x] **S2.** Author `02-plan.md` (Amplify Gen 2, JWT authorizer, Lambdas, DynamoDB, frontend mapping)
- [x] **S3.** Author `03-tasks.md` (this checklist)
- [ ] **S4.** Cross-link from `specs/01-sdd-workflow.md` example feature folders (include `03-auth-profile`)

---

## Backend setup

- [x] **B1.** Add DynamoDB users table resource to Serverless (`us-east-1`, on-demand, `PK`/`SK` per schema). Export `USERS_TABLE_NAME`. No GSI1 yet (scheduler feature owns it).
- [x] **B2.** Add AWS SDK v3 DynamoDB deps (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`) if missing. Do not add `aws-sdk` v2.
- [x] **B3.** Wire HTTP API Cognito JWT authorizer (issuer + audience from stage env / params â€” nothing secret committed).
- [x] **B4.** Implement `getProfile` Lambda (`GET /me/profile`): extract `sub` + `email`, get-or-create profile with defaults, return profile JSON.
- [x] **B5.** Implement `updateProfile` Lambda (`PUT /me/profile`): validate `targetRoles`, update item, return profile.
- [x] **B6.** Register both functions in Serverless; grant least-privilege DynamoDB IAM; smoke-test with a real Cognito ID token against `dev` or offline + mocked authorizer.

---

## Frontend UI integration

- [x] **F1.** Add Amplify Gen 2 auth (Cognito) to the frontend; configure from Amplify outputs / env (no secrets in git).
- [ ] **F2.** Add sign-up / sign-in / sign-out UX (Authenticator or equivalent).
- [ ] **F3.** Add authenticated API helper that attaches `Authorization: Bearer <idToken>` and calls `NEXT_PUBLIC_API_URL`.
- [ ] **F4.** Build profile/settings page: read-only email, `targetRoles` editor, save via `PUT /me/profile`, load via `GET /me/profile`.
- [ ] **F5.** End-to-end: new user signs up â†’ profile created with defaults â†’ edits roles â†’ reload shows saved roles; signed-out API calls fail clearly.

---

## Definition of done

All tasks above are `[x]`, and acceptance criteria AC-1 through AC-7 in `01-spec.md` are satisfied without violating `.cursorrules` guardrails.

