# Feature: CV Upload — Plan (How)

**Feature slug:** `01-cv-upload`  
**Implements:** [01-spec.md](./01-spec.md)  
**Stack:** Serverless Framework v3 · Node.js 20.x · AWS SDK v3 · Next.js App Router · Amplify Gen 2 · `us-east-1`

---

## Architecture overview

```text
Next.js dropzone (Amplify Cognito)
        |
        |  POST /cv/presign  (+ Cognito JWT)
        v
Lambda: getPresignedUrl
  - @aws-sdk/client-s3
  - @aws-sdk/s3-request-presigner
  - returns { uploadUrl, key, expiresIn }
        |
        |  Browser PUT PDF to uploadUrl
        v
S3 bucket: job-scout-${stage}-cvs
  - private, SSE, block public access
        |
        |  POST /cv/parse { key }
        v
Lambda: parseCvPdf
  - GetObject + PDF text extract
  - Update UserProfile.cvS3Key
  - returns { key, text, charCount }
```

---

## Backend — Lambda handlers

Suggested module path (align with monorepo when implementing):

```text
backend/src/modules/cvModule/
├── getPresignedUrl/
│   ├── handler.ts
│   └── ...
└── parseCvPdf/
    ├── handler.ts
    └── ...
```

### `getPresignedUrl`

| Item | Detail |
| --- | --- |
| Trigger | API Gateway HTTP API `POST /cv/presign` |
| Auth | Cognito JWT authorizer; `userId` = Cognito Sub |
| Input | Optional body `{ contentType: "application/pdf" }` |
| SDK | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` |
| Logic | Validate content type → build key `cvs/{userId}/{Date.now()}.pdf` → `PutObject` presign |
| Output | `200 { uploadUrl: string, key: string, expiresIn: number }` |
| Errors | `401` unauthenticated; `400` invalid content type |

Presign parameters (MVP defaults):

- `ExpiresIn`: `120` seconds
- `ContentType`: `application/pdf` (signed into the request)
- Bucket from env `CV_BUCKET_NAME`

### `parseCvPdf`

| Item | Detail |
| --- | --- |
| Trigger | API Gateway HTTP API `POST /cv/parse` |
| Auth | Cognito JWT; caller may only parse keys under `cvs/{userId}/` |
| Input | `{ key: string }` |
| SDK | `@aws-sdk/client-s3` `GetObject`; DynamoDB document client for profile update |
| Logic | Authorize key prefix → download bytes → extract text (lightweight PDF lib) → update `UserProfile.cvS3Key` |
| Output | `200 { key: string, text: string, charCount: number }` |
| Errors | `401` / `403` wrong prefix; `404` missing object; `422` empty/unreadable PDF |

**MVP text persistence:** Return extracted `text` in the response and set `cvS3Key` on the profile. Optional later: store a `.txt` sidecar next to the PDF. Do not invoke Bedrock in this feature.

---

## S3 bucket rules

| Rule | Value |
| --- | --- |
| Name | `job-scout-${stage}-cvs` (or Serverless-generated) |
| Region | `us-east-1` |
| Public access | Block all public access |
| Encryption | SSE-S3 preferred (cost); SSE-KMS optional |
| CORS | Allow Amplify / localhost origins for browser `PUT` |
| Object ownership | BucketOwnerEnforced (no ACLs) |
| Lifecycle | Optional expire of old keys — defer if credits are tight |

IAM: Lambdas get least-privilege `s3:PutObject` (for the signing principal), `s3:GetObject` for parse, scoped to the CV bucket ARN.

---

## DynamoDB

- Table: users / `UserProfile` per [../../02-database-schema.md](../../02-database-schema.md).
- On successful parse: `UpdateItem` set `cvS3Key`, `updatedAt`.

---

## Frontend — Next.js UI

| Piece | Detail |
| --- | --- |
| Hosting | AWS Amplify Gen 2 |
| Auth | Amplify Cognito session; `Authorization: Bearer <idToken>` on API calls |
| Component | CV dropzone accepting `.pdf` only |
| Flow | 1) `POST /cv/presign` → 2) `PUT` file to `uploadUrl` with `Content-Type: application/pdf` → 3) `POST /cv/parse` with `{ key }` → 4) show success / character count |
| UX | Disable while uploading; clear errors for auth, type, and parse failures |

Suggested location when implementing:

```text
frontend/src/components/cv/CvUploadDropzone.tsx
frontend/src/app/... page that mounts the dropzone
```

API base URL from Amplify / env (`NEXT_PUBLIC_API_URL`).

---

## Serverless (v3) wiring notes

- Runtime: `nodejs20.x`
- Functions declared in Serverless config with Cognito authorizer
- Environment: `CV_BUCKET_NAME`, `USERS_TABLE_NAME`
- Package with esbuild; keep bundle small
- Use explicit `@aws-sdk/*` v3 clients — never `aws-sdk` v2

---

## Security & cost notes

- Never make CV objects public.
- Enforce key prefix = authenticated `userId`.
- Cap PDF size in the UI (e.g. 5 MB); reject oversized objects at parse if needed.
- Short presign TTL reduces leaked-URL risk.
- Keep Lambda memory modest (e.g. 256–512 MB) for PDF parse; timeout e.g. 15–30s.
- No OpenAI, Supabase Storage, or Vercel Blob — S3 only.
