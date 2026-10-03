# Feature: CV Upload — Tasks

**Feature slug:** `01-cv-upload`  
**Follow:** [01-spec.md](./01-spec.md) · [02-plan.md](./02-plan.md)  
**Protocol:** Execute **one** unchecked task at a time; wait for confirmation; then mark `[x]`.

---

## Backend setup

- [x] **B1.** Add S3 CV bucket resource to Serverless Framework v3 config (`us-east-1`, block public access, SSE, CORS for PUT). Export bucket name as `CV_BUCKET_NAME`.
- [x] **B2.** Ensure DynamoDB users table (or resource) exists for `UserProfile` per `specs/02-database-schema.md`; export `USERS_TABLE_NAME`.
- [x] **B3.** Add AWS SDK v3 deps: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, DynamoDB document client packages as needed. Do not add `aws-sdk` v2.
- [x] **B4.** Implement `getPresignedUrl` Lambda (`POST /cv/presign`): Cognito auth, validate `application/pdf`, key `cvs/{userId}/{timestamp}.pdf`, return `{ uploadUrl, key, expiresIn }`.
- [x] **B5.** Wire `getPresignedUrl` into Serverless functions + Cognito authorizer; grant `s3:PutObject` on the CV bucket.
- [x] **B6.** Implement `parseCvPdf` Lambda (`POST /cv/parse`): authorize `cvs/{userId}/` prefix, `GetObject`, extract PDF text, update `UserProfile.cvS3Key`, return `{ key, text, charCount }`.
- [x] **B7.** Wire `parseCvPdf` into Serverless; grant `s3:GetObject` + DynamoDB `UpdateItem` on users table.
- [ ] **B8.** Smoke-test both endpoints locally or against `dev` stage with a small text PDF (presign → PUT → parse → verify `cvS3Key`).

---

## Frontend UI integration

- [ ] **F1.** Configure Amplify Gen 2 / env with API base URL (`NEXT_PUBLIC_API_URL`) and Cognito so the client can attach ID tokens.
- [ ] **F2.** Add `CvUploadDropzone` component (PDF-only, size cap e.g. 5 MB, loading/error/success states).
- [ ] **F3.** Implement client flow: authenticated `POST /cv/presign` → `PUT` to `uploadUrl` with `Content-Type: application/pdf` → `POST /cv/parse` with `{ key }`.
- [ ] **F4.** Mount dropzone on the profile (or settings) page; show parse success feedback (e.g. character count).
- [ ] **F5.** End-to-end UI test: signed-in user uploads a PDF and sees success; signed-out / non-PDF paths fail clearly.

---

## Definition of done

All backend and frontend tasks above are `[x]`, and acceptance criteria AC-1 through AC-6 in `01-spec.md` are satisfied without violating `.cursorrules` guardrails.
