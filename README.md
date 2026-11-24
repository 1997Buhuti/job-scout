# Job Scout

Job Scout is a job-search assistant. Users upload a CV, set job preferences, and get a scheduled digest of matching job portal listings.

Monorepo for the Job Scout web app and API.

| Package | Path | Role |
| --- | --- | --- |
| `@job-scout/frontend` | `frontend/` | Next.js app (App Router, TypeScript, Tailwind) |
| `@job-scout/backend` | `backend/` | Serverless Framework v4 + TypeScript API |

## Features

| Feature | Frontend route | Backend |
| --- | --- | --- |
| Sign up / log in (Cognito) | `/signup`, `/login` | Cognito JWT authorizer |
| CV upload | `cv` feature | `POST /cv/presign`, `cvModule` (PDF parsing) |
| Profile and preferences | `/profile` | `GET /me/profile`, `PUT /me/profile`, `profileModule` |
| Scheduled job runs | `/scheduler` | `PUT /me/schedule`, `schedulerModule` |
| Job portals | `/portals` | `portals` feature |
| Matches digest | `/matches-digest` | `matches-digest` feature |

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

## Frontend

Feature code lives under `frontend/src/features/<domain>/`. Routes in `frontend/src/app/` only compose those features.

| Domain | Folder |
| --- | --- |
| Auth | `features/auth` |
| CV | `features/cv` |
| Profile | `features/profile` |
| Scheduler | `features/scheduler` |
| Portals | `features/portals` |
| Matches digest | `features/matches-digest` |

Shared, domain-agnostic UI goes in `frontend/src/components/ui` and `frontend/src/components/common`.

## Backend

Config is TypeScript (`backend/serverless.ts`), not YAML.

| Piece | Role |
| --- | --- |
| `serverless.ts` | Stack config — API Gateway HTTP API, Lambdas, DynamoDB tables, IAM |
| `src/functions/` | Standalone Lambdas |
| `src/modules/` | Domain features — `cvModule`, `profileModule`, `schedulerModule` |
| `src/common/` | Response helpers, errors, logger, Middy wrapper |
| `src/libs/` | Thin helpers |
| `src/serverless/` | Shared Serverless config and resources |

Path aliases: `@common/*`, `@functions/*`, `@libs/*`, `@modules/*`, `@data/*`.

### API routes

All routes are served by a single API Gateway **HTTP API** (payload format 2.0). There is no REST API. Routes marked "Cognito JWT" require a valid Cognito access token.

| Function | Route | Auth | Handler |
| --- | --- | --- | --- |
| `TestEndpoint` | `GET /test` | none | `src/functions/test/handler.main` |
| `getPresignedUrl` | `POST /cv/presign` | Cognito JWT | `src/modules/cvModule/getPresignedUrl/handler.main` |
| `getProfile` | `GET /me/profile` | Cognito JWT | `src/modules/profileModule/getProfile/handler.main` |
| `updateProfile` | `PUT /me/profile` | Cognito JWT | `src/modules/profileModule/updateProfile/handler.main` |
| `updateSchedule` | `PUT /me/schedule` | Cognito JWT | `src/modules/schedulerModule/updateSchedule/handler.main` |

`POST /cv/presign` returns `{ data: { uploadUrl, key, expiresIn } }`. All success responses are wrapped in `data`. The browser then PUTs the PDF straight to S3 with `Content-Type: application/pdf`. `CV_BUCKET_NAME` and the `s3:PutObject` grant come from the `CvBucket` resource in `backend/src/serverless/resources/cv-bucket.ts`.

### Scheduler

`schedulerDispatcher` runs on an EventBridge schedule (`rate(1 hour)`). It uses one shared tick to find every user whose schedule is due, instead of creating a separate EventBridge rule per user. Due users are processed by `runUserPipeline`, which scrapes portals and upserts matching jobs.

### Adding a feature

1. Create `backend/src/modules/<domain>Module/<feature>/` with `handler.ts`, action files, and `index.ts` exporting `AWS['functions']`.
2. Wire those functions into `backend/serverless.ts`.
3. Export `main = wrapper(handler)` from `handler.ts`.
4. Register a service name in `backend/src/common/constants.ts`.
