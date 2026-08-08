# Ecommerce API

Serverless Framework v4 + TypeScript base project, patterned after BodyShop Booster (`boost-api`).

## Architecture

| Piece | Role |
| --- | --- |
| `serverless.ts` | Init stack (`ecommerce-api-init`) — API Gateway + test Lambda |
| `src/functions/` | Standalone Lambdas (test, authorizers, etc.) |
| `src/modules/` | Domain features (products, orders, …) — add as you grow |
| `src/common/` | Shared response helpers, errors, logger, Middy wrapper |
| `src/libs/` | Thin helpers (`middyfy`, API Gateway types) |
| `src/serverless/` | Shared Serverless config (esbuild, prune, offline) |
| `src/data/` | DB clients / repositories (placeholder) |

Config is **strictly TypeScript** (`serverless.ts`), not YAML.

Path aliases: `@common/*`, `@functions/*`, `@libs/*`, `@modules/*`, `@data/*`.

## Prerequisites

- Node.js ≥ 24
- Serverless Framework v4 (`npm i -g serverless` or use the local binary)
- AWS credentials configured if you deploy

## Setup

```bash
cd "C:\My Projhects\ecommerce-api"
npm install
cp .env.example .env
```

## Local

```bash
npm start
```

Test endpoint: `GET http://localhost:3000/dev/test`

## Deploy

```bash
npm run deploy
# or a single function:
npm run deploy:func -- TestEndpoint
```

## Adding a feature 

1. Create `src/modules/<domain>Module/<feature>/` with `handler.ts`, action files, and `index.ts` exporting `AWS['functions']`.
2. Wire those functions into `serverless.ts` (or a new `serverless-<stack>.ts` when the stack grows).
3. Export `main = wrapper(handler)` from `handler.ts`.
4. Register a service name in `src/common/constants.ts`.

## Test Lambda

- **Name:** `TestEndpoint`
- **Path:** `GET /test`
- **Handler:** `src/functions/test/handler.main`
