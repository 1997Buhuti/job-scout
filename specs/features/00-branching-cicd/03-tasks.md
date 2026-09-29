# Feature: Branching & CI/CD Strategy — Tasks

**Feature slug:** `00-branching-cicd`  
**Spec:** [01-spec.md](./01-spec.md) · **Plan:** [02-plan.md](./02-plan.md)

Ordered checklist. Mark `[x]` only after the step is done and verified.

---

## Specs & docs

- [x] Author `01-spec.md` (branching, CI/CD, public-repo security requirements)
- [x] Author `02-plan.md` (OIDC, Amplify, path filters, profile/CI notes)
- [x] Cross-link branching rules from `specs/01-sdd-workflow.md`

## Repository workflows

- [x] Add `.github/workflows/ci-backend.yml` (PR checks, no AWS deploy)
- [x] Add `.github/workflows/deploy-backend.yml` (main → prod via OIDC + Environment)
- [x] Add `.github/dependabot.yml` for GitHub Actions updates
- [x] Make `backend/serverless.ts` CI-safe: remove hardcoded `provider.profile` (use local `AWS_PROFILE` / `--aws-profile` instead)

## GitHub configuration (manual)

- [x] Create GitHub Environment `production`
- [x] Add Environment secret `AWS_ROLE_ARN` (after IAM role exists)
- [x] Add Environment secret `SERVERLESS_ACCESS_KEY` if Serverless Framework v4 org deploy requires it
- [x] Add Environment variable `AWS_REGION=us-east-1`
- [x] Enable branch protection on `main`: require PR, no force-push, require `CI Backend` status check

## AWS configuration (manual)

- [x] Create IAM OIDC provider for `token.actions.githubusercontent.com`
- [x] Create deploy IAM role with trust policy scoped to `repo:OWNER/REPO:environment:production`
- [x] Attach least-privilege deploy policy to the deploy role
- [ ] Confirm `serverless deploy --stage prod` succeeds from Actions (see Verification)

## Amplify (manual)

- [x] Connect repo; set app root `frontend`, build `npm run build`, filter `frontend/**`, branch `main`
- [ ] Move any API/Cognito config into Amplify Console env vars (nothing sensitive in git)

## Verification

- [ ] Open a test PR changing only `backend/**` → CI runs; no deploy
- [ ] Merge a harmless `backend/**` change (or workflow-only) → deploy job assumes OIDC role and completes
- [ ] Push a specs-only change → backend deploy workflow does **not** run
