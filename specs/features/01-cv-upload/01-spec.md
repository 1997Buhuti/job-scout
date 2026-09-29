# Feature: CV Upload — Spec (What & Why)

**Feature slug:** `01-cv-upload`  
**App:** Job Scout  
**Related schema:** [../../02-database-schema.md](../../02-database-schema.md) (`UserProfile.cvS3Key`)

---

## Problem / context

Matching quality depends on the user’s CV text. Job Scout must let an authenticated user upload a PDF CV without shipping the file through Lambda payloads (cost and size limits). The file lands in private S3 via a **presigned URL**; a separate step extracts text so later Bedrock evaluations can use it.

---

## Goals

1. Authenticated users can obtain a short-lived S3 **presigned PUT URL** for their CV PDF.
2. After a successful browser upload, the backend can **parse PDF text** from the stored object.
3. The user’s `UserProfile.cvS3Key` is updated to point at the latest CV object.

---

## Functional requirements

### FR-1 — Presigned upload URL

- Given a valid Cognito-authenticated request, the API returns a presigned PUT URL and the target S3 object key.
- Object key pattern: `cvs/{userId}/{timestamp}.pdf` (or equivalent stage-safe variant).
- Content type constrained to `application/pdf`.
- Presign TTL: short-lived (e.g. 60–300 seconds). Prefer the lower end for security.
- Unauthenticated requests are rejected (`401`).

### FR-2 — Direct browser upload to S3

- The frontend uploads the PDF **directly to S3** using the presigned URL (PUT).
- The file must not be posted as a multipart body to API Gateway / Lambda for storage.

### FR-3 — Parse CV PDF text

- After upload, the client (or an explicit follow-up call) invokes a parse endpoint with the object key (or relies on the server using the authenticated user’s latest `cvS3Key`).
- A Lambda reads the object from S3 with AWS SDK v3 and extracts plain text from the PDF.
- Extracted text is available for subsequent match pipelines (persistence shape for raw text may be profile attribute, S3 sidecar, or ephemeral response in MVP — define in plan; MVP minimum is successful extraction returned or stored for the user).

### FR-4 — Profile update

- On successful upload confirmation / parse initiation, `UserProfile.cvS3Key` is set to the new key.
- Replacing a CV overwrites the profile pointer to the new key (old objects may remain until a later cleanup policy).

---

## Non-goals

- Parsing Word (`.docx`) or image-only scans with OCR.
- Public or permanent share links for CVs.
- Virus scanning beyond basic content-type / extension checks (may be added later).
- Bedrock evaluation of the CV in this feature (owned by a later match feature).

---

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | Authenticated `getPresignedUrl` returns `{ uploadUrl, key }` for `application/pdf`. |
| AC-2 | Unauthenticated call returns `401`. |
| AC-3 | Browser can PUT a small PDF to `uploadUrl` and receive `200` from S3. |
| AC-4 | `parseCvPdf` reads that S3 object and returns non-empty extracted text for a text-based PDF. |
| AC-5 | After a successful flow, DynamoDB `UserProfile.cvS3Key` equals the uploaded key. |
| AC-6 | Non-PDF content type is rejected at presign or parse validation. |

---

## Constraints

- **AWS only:** S3 + Lambda + API Gateway + Cognito + DynamoDB. No third-party upload/CDN services.
- **SDK:** AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, DynamoDB clients).
- **Runtime:** Node.js 20.x, Serverless Framework v3.
- **Region:** `us-east-1`.
- **Budget:** Prefer short TTLs, small Lambda memory, and no unnecessary S3 public access.
