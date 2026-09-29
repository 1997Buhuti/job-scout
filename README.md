# Job Scout

Monorepo for the Job Scout web app and API.

| Package | Path | Role |
| --- | --- | --- |
| `@job-scout/frontend` | `frontend/` | Next.js app (App Router, TypeScript, Tailwind) |
| `@job-scout/backend` | `backend/` | Serverless Framework v4 + TypeScript API |

## Prerequisites

- Node.js ≥ 24 (see `.nvmrc`)
- AWS credentials if you deploy the API

## Setup

```bash
npm install
```

Copy `backend/.env.example` to `backend/.env` before deploying. Local offline mode works without AWS keys.

## Scripts

```bash
npm run dev            # API on :3000 and web app on :3001
npm run dev:backend    # API only — GET http://localhost:3000/dev/test
npm run dev:frontend   # web app only — http://localhost:3001
npm test               # backend tests
npm run build          # production build of the web app
```

Deploy the API from the repo root:

```bash
npm run deploy -w @job-scout/backend
npm run deploy:func -w @job-scout/backend -- TestEndpoint
```

## Backend

Config is TypeScript (`backend/serverless.ts`), not YAML.

| Piece | Role |
| --- | --- |
| `serverless.ts` | Init stack — API Gateway + test Lambda |
| `src/functions/` | Standalone Lambdas |
| `src/modules/` | Domain features — add as you grow |
| `src/common/` | Response helpers, errors, logger, Middy wrapper |
| `src/libs/` | Thin helpers |
| `src/serverless/` | Shared Serverless config |

Path aliases: `@common/*`, `@functions/*`, `@libs/*`, `@modules/*`, `@data/*`.

### Adding a feature

1. Create `backend/src/modules/<domain>Module/<feature>/` with `handler.ts`, action files, and `index.ts` exporting `AWS['functions']`.
2. Wire those functions into `backend/serverless.ts`.
3. Export `main = wrapper(handler)` from `handler.ts`.
4. Register a service name in `backend/src/common/constants.ts`.

Test Lambda: `TestEndpoint` — `GET /test` — `src/functions/test/handler.main`.
