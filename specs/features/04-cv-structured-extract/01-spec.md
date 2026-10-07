# Feature: CV Structured Extract — Spec (What & Why)

**Feature slug:** `04-cv-structured-extract`  
**App:** Job Scout  
**Depends on:** [../01-cv-upload/01-spec.md](../01-cv-upload/01-spec.md) (PDF in S3 + plain-text parse + `cvS3Key`)  
**Related schema:** [../../02-database-schema.md](../../02-database-schema.md) (`UserProfile`)  
**UI consumer:** Profile / CV settings — prefill editable skills (and related fields)

---

## Problem / context

`01-cv-upload` stores the PDF and can return raw extracted text, but the UI cannot usefully prefill **skills**, **experience**, and similar fields from a blob of prose. Matching and profile UX need a **small, structured JSON profile** derived from the CV.

On a $50 credit budget, that extraction must be cheap: use **Amazon Nova Micro once per successful CV parse**, not Claude Haiku, and not a Bedrock call per job.

---

## Goals

1. After a CV PDF is uploaded and plain text is available, produce a **structured `CvProfile` JSON** (skills, experience, education, summary, optional identity fields).
2. Persist that profile so the UI can load and edit it without re-calling Bedrock on every page view.
3. Prefill profile UI (especially **skills chips**) from the latest extract; user may correct before save.
4. Keep AI cost minimal: **one Nova Micro invoke per CV upload/parse**, with a hard output-token cap.

---

## Functional requirements

### FR-1 — Trigger

- Structured extract runs **after** successful PDF text extraction for an authenticated user (same flow as `POST /cv/parse`, or a dedicated follow-up endpoint owned by this feature — define in plan).
- Input is the plain CV text (and/or the authorized `cvs/{userId}/…` key). Caller may only operate on their own prefix / profile.
- Unauthenticated requests are rejected (`401`). Wrong key prefix → `403`.

### FR-2 — `CvProfile` JSON shape (MVP)

The model (or a validated post-process step) must return JSON conforming to:

```typescript
export interface CvExperience {
  title: string;
  company: string;
  /** Free-form period if dates are unclear, e.g. "2021 – Present" */
  period?: string;
  summary?: string;
}

export interface CvEducation {
  institution: string;
  degree?: string;
  field?: string;
  /** Graduation year or period string */
  year?: string;
}

export interface CvProfile {
  /** Best-effort full name from the CV */
  fullName?: string;
  /** Short professional summary if present */
  summary?: string;
  /** Normalized skill labels (deduped, trimmed) */
  skills: string[];
  experience: CvExperience[];
  education: CvEducation[];
  /** ISO-8601 when this extract was produced */
  extractedAt: string;
  /** S3 key of the PDF this extract was derived from */
  sourceCvS3Key: string;
}
```

**MVP caps (reject or truncate in validation, not in a second model call):**

| Field | Cap |
| --- | --- |
| `skills` | max **40** items; each max **48** chars |
| `experience` | max **15** entries |
| `education` | max **10** entries |
| `summary` / experience `summary` | max **500** chars each |
| Free-text string fields | trim; drop empty strings |

Missing sections → empty arrays / omitted optionals. Do not invent employers or degrees that are not grounded in the CV text; prefer omit over hallucinate.

### FR-3 — Bedrock model (cost)

- Model ID: **`amazon.nova-micro-v1:0`** only for this feature.
- Region: **`us-east-1`**.
- **One** invoke per successful CV parse / re-parse (not per job listing).
- Prompt: instruct **JSON only** (no markdown fences in the ideal path; strip fences if present).
- Output token cap: **max 1024** tokens for this feature (enough for the structured object; keep prompts short).
- Do **not** use Claude Haiku for CV structuring in this feature.

### FR-4 — Persistence

- On success, persist `CvProfile` for the user so later `GET` profile (or a dedicated CV-profile read) returns it without Bedrock.
- Persistence options (choose one in plan; MVP must pick exactly one):
  1. DynamoDB attribute(s) on `UserProfile` (e.g. `cvProfile` map / document), or
  2. Private S3 JSON sidecar next to the PDF + pointer on `UserProfile`.
- Always keep `UserProfile.cvS3Key` as the PDF pointer from `01-cv-upload`.
- Replacing a CV and re-running extract **overwrites** the previous structured profile for that user.

### FR-5 — Profile / UI consumption

- After extract, API response includes at least `{ cvProfile }` (or the full profile including `cvProfile`) so the dropzone flow can show success and prefilled skills.
- Profile / settings UI shows **editable skills** (and may show experience/education read-only or editable in MVP — define in plan; minimum is skills editable).
- User edits are saved via an authenticated profile update path; client must not be able to set `userId` or forge another user’s extract.
- Saving user-edited skills must **not** require another Bedrock call.

### FR-6 — Failure behavior

- If Nova Micro fails, times out, or returns unparseable JSON: return a clear error (`502` / `422` as appropriate); **do not** wipe a previous good `cvProfile` unless the plan explicitly chooses overwrite-on-failure.
- If PDF text was empty, do not call Bedrock (`422`).
- Truncate overly long CV text before the prompt (plan: character/token budget) to protect cost.

---

## Non-goals

- OCR for image-only / scanned PDFs.
- Parsing `.docx` or other non-PDF formats.
- Using Bedrock for per-job matching in this feature (owned by scheduler / match features; Haiku remains the job-eval model unless a later spec changes that).
- Full ATS résumé graph, certifications taxonomy, or LinkedIn import.
- Auto-writing cover letters or rewriting the CV.
- Dictionary-only skill extraction as the primary path (allowed later as a fallback; MVP primary path is Nova Micro JSON).

---

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-1 | After a successful CV text parse for a text PDF, the system produces a valid `CvProfile` JSON including `skills` (array), `experience`, `education`, `extractedAt`, and `sourceCvS3Key`. |
| AC-2 | Structured extract uses **only** Bedrock model `amazon.nova-micro-v1:0` in `us-east-1`, with output tokens capped ≤ 1024. |
| AC-3 | At most **one** Nova Micro invoke occurs per successful parse/re-parse of a CV. |
| AC-4 | Persisted `cvProfile` is returned on a subsequent authenticated profile/CV read without calling Bedrock again. |
| AC-5 | Profile UI can display prefilled **skills** from `cvProfile`; user can edit and save skills without a Bedrock call. |
| AC-6 | Unauthenticated extract/read/update is `401`; users cannot extract or overwrite another user’s CV prefix / profile. |
| AC-7 | Invalid / empty PDF text does not invoke Bedrock; malformed model output does not leave the API returning unchecked raw model text as if it were `CvProfile`. |
| AC-8 | No third-party AI/upload services; AWS SDK v3 only. |

---

## Constraints

- **AWS only:** Lambda, API Gateway, Cognito, S3, DynamoDB, Bedrock.
- **SDK:** AWS SDK v3 (`@aws-sdk/client-bedrock-runtime`, S3/DynamoDB clients as needed). Never `aws-sdk` v2.
- **Runtime:** Node.js 20.x, Serverless Framework v3.
- **Region:** `us-east-1`.
- **Budget:** Prefer short prompts, truncated CV text input, single Micro call per upload, modest Lambda memory/timeout.
- **Guardrails:** Job-evaluation Bedrock calls remain Claude Haiku (`anthropic.claude-3-haiku-20240307-v1:0`, max 300 output tokens) per project rules; this feature is the exception that uses Nova Micro for CV structuring only.

---

## Open decisions (resolve in `02-plan.md`)

1. Inline extract inside `parseCvPdf` vs dedicated `POST /cv/structure` (or similar).
2. DynamoDB `cvProfile` vs S3 `.json` sidecar.
3. Whether MVP UI edits only `skills` or also experience/education.
4. Whether failed extract keeps the previous `cvProfile` or clears it.
