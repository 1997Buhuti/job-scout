# Spec-Driven Development (SDD) Workflow

Job Scout uses a strict Spec-Driven Development protocol. Specifications in `/specs` are the source of truth. Cursor AI and human contributors must not invent behavior that is not backed by a spec.

---

## 3-Artifact Pattern

Every feature (or non-trivial change) lives under:

```text
specs/features/<feature-slug>/
├── 01-spec.md    # What & Why
├── 02-plan.md    # How (technical architecture)
└── 03-tasks.md   # Step-by-step execution checklist
```

### `01-spec.md` — What & Why

| Section | Purpose |
| --- | --- |
| Problem / context | Why this feature exists |
| Functional requirements | Observable behavior |
| Non-goals | Explicit exclusions |
| Acceptance criteria | Testable pass/fail conditions |
| Constraints | Budget, AWS-only, SDK versions, model caps |

No implementation detail beyond what is required to clarify product intent.

### `02-plan.md` — How

| Section | Purpose |
| --- | --- |
| Architecture | Components, data flow, AWS services |
| API / Lambda contracts | Routes, events, request/response shapes |
| Data model impact | DynamoDB / S3 keys and attributes |
| Frontend mapping | Pages, components, Amplify integration |
| Security & cost notes | IAM least privilege, timeouts, token caps |

Plans must assume **Serverless Framework v3**, **Node.js 20.x**, **AWS SDK v3**, **Amplify Gen 2**, region **us-east-1**.

### `03-tasks.md` — Checklist

- Ordered, atomic tasks (`[ ]` unchecked).
- Separate backend setup from frontend UI when both are involved.
- One task = one verifiable unit of work.
- On completion, flip to `[x]` **only after** the work is done and confirmed.

---

## Cursor AI rules (mandatory)

1. **Specs first**  
   Never write or modify implementation code without reading the corresponding `01-spec.md` and `02-plan.md` under `/specs/`.

2. **One task at a time**  
   Execute a **single** unchecked item from `03-tasks.md`. Do not batch multiple checklist items in one go unless the user explicitly allows it.

3. **Wait for confirmation**  
   After finishing a task, stop and wait for user confirmation before starting the next task.

4. **Update checkboxes**  
   When a task is confirmed complete, update that line from `[ ]` to `[x]` in `03-tasks.md`.

5. **No silent scope creep**  
   If work requires behavior not covered by the feature specs, pause and update `01-spec.md` / `02-plan.md` / `03-tasks.md` first.

6. **Honor absolute guardrails** (see `.cursorrules`)  
   - AWS services only  
   - Lightweight scraping only (`axios` / `cheerio` / JSON)  
   - Bedrock Claude Haiku only, max 300 output tokens per job evaluation  
   - AWS SDK v3 only (`@aws-sdk/*`)

---

## Global specs vs feature specs

| Path | Scope |
| --- | --- |
| `specs/00-project-overview.md` | Product vision & system architecture |
| `specs/01-sdd-workflow.md` | This protocol |
| `specs/02-database-schema.md` | Shared DynamoDB / TypeScript models |
| `specs/features/<name>/` | Feature-scoped 3-artifact set |

Feature plans must align with the database schema and project overview. Conflicts are resolved by updating the global docs first, then the feature artifacts.

---

## Branching (see also `00-branching-cicd`)

| Branch | Maps to |
| --- | --- |
| `main` | Production (protected) |
| `feature/<feature-slug>` | `specs/features/<feature-slug>/` |

Do not merge a feature branch until that feature’s `03-tasks.md` is fully `[x]` and verified. CI/CD details: [features/00-branching-cicd/01-spec.md](./features/00-branching-cicd/01-spec.md).

---

## Suggested feature lifecycle

```text
1. Draft 01-spec.md (requirements + acceptance criteria)
2. Draft 02-plan.md (architecture mapping to AWS / monorepo)
3. Draft 03-tasks.md (ordered [ ] checklist)
4. Create branch feature/<feature-slug>
5. Implement task 1 → confirm → mark [x]
6. Repeat until all tasks are [x]
7. Open PR → main (CI must pass); merge only when checklist is complete
8. Leave specs in place as living documentation
```

---

## Example feature folder

```text
specs/features/01-cv-upload/
specs/features/02-job-scheduler/
```

Each folder holds `01-spec.md`, `02-plan.md`, and `03-tasks.md`.
