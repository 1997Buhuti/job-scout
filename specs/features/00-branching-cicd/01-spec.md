# Feature: Branching & CI/CD Strategy — Spec (What & Why)

**Feature slug:** `00-branching-cicd`  
**App:** Job Scout  
**Related:** [../../01-sdd-workflow.md](../../01-sdd-workflow.md), [../../00-project-overview.md](../../00-project-overview.md)

---

## Problem / context

Job Scout is a public monorepo (`frontend/`, `backend/`, `specs/`) with a strict Spec-Driven Development workflow and a **$50 AWS credits** budget. Production deploys must be predictable, mapped to feature specs, and **secure enough for an open-source repository** (no long-lived cloud keys in GitHub if avoidable; no accidental secret leakage; no untrusted-PR deploys).

---

## Goals

1. Enforce a clear branching model: `main` = production; feature branches mirror `specs/features/<slug>/`.
2. Deploy **frontend** via AWS Amplify Gen 2 on `main` when `frontend/**` changes.
3. Deploy **backend** via GitHub Actions on `main` when `backend/**` (or the deploy workflow itself) changes — never on spec-only edits.
4. Run **non-deploying CI** on pull requests that touch the backend.
5. Harden secrets and workflow permissions for a **public** GitHub repository.

---

## Functional requirements

### FR-1 — Branching rules

- `main` is protected and represents live production infrastructure.
- Every product feature maps to a branch: `feature/<feature-slug>` matching `specs/features/<feature-slug>/`  
  Example: `specs/features/01-cv-upload/` → `feature/01-cv-upload`.
- Do not merge a feature branch into `main` until all tasks in that feature’s `03-tasks.md` are `[x]` and verified.
- Non-feature work uses `chore/...`, `fix/...`, or `infra/...` (no fake feature folder required unless it has its own SDD artifacts).

### FR-2 — Frontend pipeline (Amplify Gen 2)

- App root: `frontend`
- Build command: `npm run build` (from app root / Amplify monorepo settings)
- Trigger: automatic on push to `main` when `frontend/**` changes
- Secrets / API URLs live in the **Amplify Console** environment variables — never committed

### FR-3 — Backend CI (pull requests)

- On `pull_request` targeting `main` with paths under `backend/**` or the CI workflow file:
  - install deps with `npm ci`
  - run typecheck (`npm run compile`)
  - run lint and tests when scripts exist
- Must **not** deploy, assume AWS roles with write access, or expose production secrets to fork PRs

### FR-4 — Backend CD (main only)

- Config: `.github/workflows/deploy-backend.yml`
- Trigger: push to `main` matching `backend/**` or `.github/workflows/deploy-backend.yml`
- Does **not** trigger on `specs/**` alone
- Deploys with Serverless Framework to stage `prod`, region `us-east-1`
- Authenticates to AWS via **GitHub OIDC → IAM role** (no long-lived access keys in secrets)

### FR-5 — Public-repo security baseline

- GitHub Actions: least-privilege `permissions`; `id-token: write` only on deploy jobs that need OIDC
- Production deploy uses a GitHub Environment (e.g. `production`) so secrets/role ARN are environment-scoped
- Deploy jobs run only on `push` to `main` (never on `pull_request`)
- No AWS keys, Serverless access keys, Cognito secrets, or `.env` files in the repository
- Dependabot (or equivalent) keeps GitHub Actions dependencies updated
- Branch protection on `main`: PR required, no force-push, required CI status checks when available

---

## Non-goals

- Multi-account AWS promotion pipelines (`dev` → `staging` → `prod`) beyond a single `prod` stage for MVP
- Required human reviewers on every PR (solo developer; optional later)
- Automating Amplify app creation via IaC in this feature (configure Amplify Console once)
- Replacing Spec-Driven Development with ticket-only workflow

---

## Acceptance criteria

- [ ] Spec folder `specs/features/00-branching-cicd/` documents branching, CI, CD, and public-repo security
- [ ] PR touching `backend/**` runs install + compile (+ lint/test) without deploying
- [ ] Push to `main` changing only `specs/**` does **not** deploy backend
- [ ] Push to `main` changing `backend/**` deploys via OIDC (no `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secrets required)
- [ ] Workflow YAML sets minimal `permissions` and scopes deploy to Environment `production`
- [ ] `provider.profile` (or equivalent) does not break headless CI credential chain
- [ ] Amplify monorepo root + path filters documented for `frontend`

---

## Constraints

- Public repository: assume all committed files are world-readable
- Budget: avoid unnecessary Serverless deploys (path filters; no deploy on specs-only)
- Region: `us-east-1`
- Backend: Serverless Framework (repo currently on v4 / `nodejs24.x`); frontend Amplify Gen 2
- AWS services only (no Vercel / third-party CI hosts required)
