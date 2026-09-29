# Feature: Branching & CI/CD Strategy — Plan (How)

**Feature slug:** `00-branching-cicd`  
**Spec:** [01-spec.md](./01-spec.md)

---

## Architecture

```text
feature/<slug> ──PR──► main (protected)
                         │
         ┌───────────────┼───────────────┐
         │ frontend/**   │ backend/**    │ specs/** only
         ▼               ▼               ▼
   Amplify Gen 2    GHA deploy prod   no deploy
   (build/host)     (OIDC → IAM)
                         ▲
                         │
              GHA CI on PR (no AWS write)
```

| Surface | Tool | When |
| --- | --- | --- |
| Frontend | AWS Amplify Gen 2 | Push `main` + `frontend/**` |
| Backend CI | `.github/workflows/ci-backend.yml` | PR → `main` + `backend/**` |
| Backend CD | `.github/workflows/deploy-backend.yml` | Push `main` + `backend/**` or workflow file |
| Action updates | `.github/dependabot.yml` | Weekly |

---

## Branching model

| Branch | Purpose |
| --- | --- |
| `main` | Production; protected |
| `feature/<feature-slug>` | Implements `specs/features/<feature-slug>/` |
| `chore/*`, `fix/*`, `infra/*` | Non-feature / tooling |

**Merge gate (process):** all `[ ]` in that feature’s `03-tasks.md` must be `[x]` and verified before merge.

---

## Frontend (Amplify Gen 2)

Configure once in Amplify Console (values are operational, not committed secrets):

| Setting | Value |
| --- | --- |
| Repository | This public GitHub repo |
| Branch | `main` |
| Monorepo app root | `frontend` |
| Build command | `npm run build` |
| Path filter | `frontend/**` (Amplify monorepo / app-root detection) |
| Env vars | API base URL, Cognito/Amplify outputs — **Console only** |

Do not commit Amplify-managed secrets or long-lived AWS keys into `amplify.yml` / source.

---

## Backend CI workflow

**File:** `.github/workflows/ci-backend.yml`

- `on.pull_request` → `main`, paths: `backend/**`, workflow file
- `permissions: contents: read` only
- Node **24** (matches `backend` `engines` / `nodejs24.x` runtime)
- `cache-dependency-path`: prefer workspace lockfile at repo root if present; else `backend/package-lock.json`
- Steps: checkout → setup-node → `npm ci` (from root if workspaces) → `npm run compile -w @job-scout/backend` → `npm run lint -w @job-scout/backend` → `npm test -w @job-scout/backend`
- No `id-token`, no AWS role, no Serverless deploy

Fork PRs never receive repository/environment secrets (GitHub default).

---

## Backend CD workflow (OIDC)

**File:** `.github/workflows/deploy-backend.yml`

```yaml
# Conceptual shape — see committed workflow for the source of truth
on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - '.github/workflows/deploy-backend.yml'

permissions:
  contents: read
  id-token: write   # OIDC only

jobs:
  deploy:
    environment: production
    # configure-aws-credentials → role-to-assume
    # npm ci → npx serverless deploy --stage prod --region us-east-1
```

### Path filter rationale

| Path | Deploy? | Why |
| --- | --- | --- |
| `backend/**` | Yes | Runtime / infra change |
| `.github/workflows/deploy-backend.yml` | Yes | Pipeline change must be exercised |
| `specs/**` | **No** | Spec/checkbox edits must not spend deploy credits |

### Serverless CLI notes

- Deploy: `npx serverless deploy --stage prod --region us-east-1` (no `--aws-profile` in CI)
- Framework v4 may require `SERVERLESS_ACCESS_KEY` (GitHub Environment secret) because `serverless.ts` sets `org`
- Pin / lock Serverless via `backend/package.json`; prefer `npx serverless` from local `node_modules`

### Critical: local AWS profile vs CI

`backend/serverless.ts` currently sets `provider.profile: 'personal_cli_user'`. That **breaks** OIDC/default credential chain in GitHub Actions.

**Required change:** remove hardcoded `provider.profile` (or gate it so it is unset in CI). Locally, developers use `AWS_PROFILE=personal_cli_user` or CLI `--aws-profile`.

---

## AWS OIDC setup (one-time, manual)

### 1. IAM OIDC identity provider

- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

### 2. IAM role trust policy (replace `OWNER` / `REPO`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:OWNER/REPO:environment:production"
        }
      }
    }
  ]
}
```

Prefer `environment:production` subject over `ref:refs/heads/main` alone so only the Environment-gated job can assume the role.

### 3. Role permissions

Least privilege for Serverless deploy to this stack (CloudFormation, Lambda, API Gateway, IAM role updates for functions, S3 for packages, CloudWatch Logs, EventBridge, DynamoDB, S3 app buckets, SES, Bedrock invoke as needed). Start narrow; expand only when deploy fails on missing permissions. Avoid `AdministratorAccess` on a public repo’s deploy role if possible.

### 4. GitHub Environment `production`

| Secret / var | Purpose |
| --- | --- |
| `AWS_ROLE_ARN` | IAM role ARN for OIDC (`configure-aws-credentials`) |
| `SERVERLESS_ACCESS_KEY` | Serverless Framework v4 org/dashboard auth (if required) |
| `AWS_REGION` (variable) | `us-east-1` |

**Do not create** `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for this pipeline.

Optional Environment protection: required reviewer / wait timer (useful even for solo if you want a pause before prod).

---

## Public-repository security checklist

| Control | Implementation |
| --- | --- |
| No long-lived AWS keys in GitHub | OIDC + `AWS_ROLE_ARN` only |
| Scoped deploy | GitHub Environment `production` + OIDC `sub` condition |
| Minimal token | Workflow `permissions` default deny except `contents: read` (+ `id-token: write` on deploy) |
| No PR deploy | Deploy workflow `on.push` only |
| No secret commits | `.gitignore` already covers `.env` / `.env.*` |
| Action supply chain | Dependabot for `github-actions`; prefer tagged official actions |
| Branch protection | PR required; block force-push; require `CI Backend` check |
| Amplify secrets | Console env vars only |
| Log hygiene | Never `echo` secrets; Serverless verbose OK, avoid printing env dumps |

---

## Monorepo install strategy

Root `package.json` uses npm workspaces (`backend`, `frontend`). CI/CD should:

1. Checkout repo root
2. `npm ci` at root (requires root `package-lock.json`)
3. Run workspace scripts with `-w @job-scout/backend`

If root lockfile is missing, fall back to `cd backend && npm ci` and document generating the lockfile.

---

## Cross-feature coordination

When a feature changes API **and** UI: prefer one PR with both sides compatible, or backend-first with backward-compatible contracts. Path filters can otherwise ship frontend against an old API for one commit.

---

## Cost notes

- Skip backend deploy on spec-only pushes
- Single `prod` stage for MVP (no parallel `dev` stage in CI)
- Cancel in-progress deploy of the same workflow via `concurrency` group

---

## Out of scope for code in this feature

- Creating the IAM OIDC provider / role in AWS (manual; documented above)
- Amplify Console app creation
- Enabling GitHub branch protection UI toggles (manual; checklist in tasks)
