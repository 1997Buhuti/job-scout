# Feature: CV Structured Extract — Plan (How)

**Feature slug:** `04-cv-structured-extract`  
**Implements:** [01-spec.md](./01-spec.md)  
**Stack:** Serverless Framework v3 · Node.js 20.x · AWS SDK v3 · Next.js App Router · Amplify Gen 2 · `us-east-1`

---

## Architecture overview

```text
POST /cv/parse (from 01-cv-upload)
        |
        v
Lambda: parseCvPdf (enhanced)
  - Extract PDF text (existing)
  - NEW: structureExtraction(text) ? CvProfile
  - Update UserProfile.cvProfile (DynamoDB)
  - Return { key, text, charCount, cvProfile }
        |
        v
DynamoDB: UserProfile
  - cvProfile attribute (map/document)
        |
        v
Frontend: Profile UI
  - Display skills chips
  - User edits ? PUT /profile
```

**Decision:** Integrate structured extraction into existing `parseCvPdf` Lambda rather than creating a separate endpoint. This reduces cold starts, latency, and simplifies the client flow.

---

## Backend — Enhanced `parseCvPdf`

### Module structure

```text
backend/src/modules/cvModule/parseCvPdf/
+-- handler.ts              (orchestrator)
+-- parseCvPdf.ts           (existing PDF ? text)
+-- structureExtraction.ts  (NEW: text ? CvProfile)
+-- skillDictionary.ts      (NEW: curated skill list)
+-- patterns.ts             (NEW: regex patterns for sections)
+-- types.ts                (CvProfile interfaces)
+-- __tests__/
    +-- parseCvPdf.test.ts  (existing)
    +-- structureExtraction.test.ts (NEW)
```

### Enhanced handler flow

| Step | Detail |
| --- | --- |
| 1. Auth | Verify Cognito JWT; check `cvs/{userId}/` prefix |
| 2. Download | `GetObject` from S3 (existing) |
| 3. Extract text | `pdf-parse` ? plain text (existing) |
| 4. **NEW: Structure** | `structureExtraction(text)` ? `CvProfile` |
| 5. **NEW: Persist** | `UpdateItem` on `UserProfile`: set `cvProfile` attribute |
| 6. Response | `200 { key, text, charCount, cvProfile }` |

### Dependencies

Add to `backend/package.json`:

```json
{
  "dependencies": {
    "pdf-parse": "^1.1.1"  // if not already present
  }
}
```

**No additional NLP libraries in MVP** — use native regex and string methods for pattern matching.

---

## Structured extraction algorithm

### 1. Section detection (`patterns.ts`)

Detect CV sections using regex:

```typescript
const SECTION_PATTERNS = {
  skills: /\b(skills?|technical skills?|core competencies|technologies)\b/i,
  experience: /\b(experience|work history|employment|professional experience)\b/i,
  education: /\b(education|academic|qualifications?)\b/i,
  summary: /\b(summary|profile|objective|about me)\b/i,
};

function detectSections(text: string): Map<string, string> {
  // Split text into sections based on headings
  // Return map of sectionType ? sectionText
}
```

### 2. Skills extraction (`structureExtraction.ts`)

```typescript
import { SKILL_DICTIONARY } from './skillDictionary';

function extractSkills(text: string): string[] {
  const skills = new Set<string>();
  const normalizedText = text.toLowerCase();
  
  // Match against dictionary with fuzzy boundaries
  for (const [canonical, variations] of Object.entries(SKILL_DICTIONARY)) {
    for (const variant of [canonical, ...variations]) {
      const pattern = new RegExp(`\\b${escapeRegex(variant)}\\b`, 'gi');
      if (pattern.test(normalizedText)) {
        skills.add(canonical); // Add canonical form
        break;
      }
    }
  }
  
  // Cap at 40 skills, max 48 chars each
  return Array.from(skills)
    .filter(s => s.length <= 48)
    .slice(0, 40);
}
```

### 3. Experience extraction

```typescript
function extractExperience(sectionText: string): CvExperience[] {
  const experiences: CvExperience[] = [];
  
  // Pattern: Company name (often in ALL CAPS or bold-like)
  // Title (often preceded by "as" or on its own line)
  // Dates (MM/YYYY – MM/YYYY or similar)
  
  const datePattern = /(\d{1,2}\/\d{4}|\w+ \d{4}|\d{4})\s*[–-]\s*(\d{1,2}\/\d{4}|\w+ \d{4}|\d{4}|present)/gi;
  
  // Split by date ranges as anchors
  // Extract company + title near each date
  // (Implementation details in code)
  
  return experiences.slice(0, 15); // Cap at 15
}
```

### 4. Education extraction

```typescript
function extractEducation(sectionText: string): CvEducation[] {
  const education: CvEducation[] = [];
  
  const degreePatterns = /\b(B\.?S\.?c?|M\.?S\.?c?|PhD|Bachelor'?s?|Master'?s?|Diploma)\b/gi;
  const yearPattern = /\b(19|20)\d{2}\b/g;
  
  // Extract degree + institution + year
  // (Implementation details in code)
  
  return education.slice(0, 10); // Cap at 10
}
```

### 5. Name and summary extraction

```typescript
function extractNameAndSummary(text: string): { fullName?: string; summary?: string } {
  // Name: typically first line or after "Name:" label
  const firstLine = text.split('\n')[0]?.trim();
  const fullName = firstLine?.length < 100 ? firstLine : undefined;
  
  // Summary: from "Summary" section or first paragraph
  const summary = extractSummarySection(text)?.slice(0, 500);
  
  return { fullName, summary };
}
```

---

## Skill dictionary design

### `skillDictionary.ts`

```typescript
export const SKILL_DICTIONARY: Record<string, string[]> = {
  // Canonical skill ? [variations]
  'JavaScript': ['js', 'javascript', 'java script', 'ecmascript'],
  'TypeScript': ['ts', 'typescript', 'type script'],
  'Python': ['python', 'py'],
  'AWS': ['aws', 'amazon web services'],
  'React': ['react', 'reactjs', 'react.js'],
  'Node.js': ['node', 'nodejs', 'node.js'],
  'Docker': ['docker', 'containerization'],
  'Kubernetes': ['k8s', 'kubernetes', 'kube'],
  // ... 200-500 entries for MVP
};
```

**MVP scope:** ~200 common skills (tech + soft skills). Can be expanded post-MVP.

**Storage:** Bundled as a `.ts` file in Lambda. Post-MVP: move to S3 for easier updates.

---

## DynamoDB schema update

### `UserProfile` enhancement

Add optional attribute:

```typescript
export interface UserProfile {
  // ... existing fields
  cvProfile?: CvProfile; // NEW: structured CV data
}
```

**DynamoDB `UpdateItem` expression:**

```typescript
const params = {
  TableName: process.env.USERS_TABLE_NAME,
  Key: { userId },
  UpdateExpression: 'SET cvProfile = :cvProfile, updatedAt = :updatedAt',
  ExpressionAttributeValues: {
    ':cvProfile': cvProfile,
    ':updatedAt': new Date().toISOString(),
  },
};
```

No schema migration needed — optional attribute.

---

## Frontend integration

### Profile UI updates

**File:** `frontend/src/features/profile/components/ProfileForm.tsx` (or similar)

**Skills display:**

```tsx
<div className="skills-section">
  <h3>Skills</h3>
  <div className="skills-chips">
    {cvProfile?.skills.map(skill => (
      <Chip key={skill} label={skill} onDelete={() => removeSkill(skill)} />
    ))}
  </div>
  <Button onClick={addSkill}>Add Skill</Button>
</div>
```

**Save flow:**

```tsx
const handleSave = async () => {
  await fetch(`${API_URL}/profile`, {
    method: 'PUT',
    headers: { 
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      targetRoles, 
      cvProfile: { ...cvProfile, skills: editedSkills } 
    }),
  });
};
```

**Experience/Education (read-only in MVP):**

Display as formatted list; editing deferred to later phase.

---

## Error handling

| Scenario | Behavior |
| --- | --- |
| Empty PDF text | Skip extraction; return `422 { error: "Empty CV text" }` |
| No sections detected | Return `CvProfile` with empty arrays; do not fail |
| Parser crash | Catch exception; log; return previous `cvProfile` if exists, else `422` |
| Skill dictionary load fail | Log warning; continue with empty skill list (graceful degradation) |

**Principle:** Never block CV upload on extraction failure. Always prefer returning partial data over crashing.

---

## Testing strategy

### Unit tests

1. **`structureExtraction.test.ts`:**
   - Test skill extraction with known dictionary
   - Test section detection with sample CV text
   - Test experience/education parsing with various date formats
   - Test caps (40 skills, 15 experiences, etc.)

2. **`parseCvPdf.test.ts` (enhance existing):**
   - Mock S3 GetObject
   - Verify `cvProfile` attribute is persisted
   - Verify response includes `cvProfile`

### Integration test

- Upload a real PDF CV via UI
- Verify `GET /profile` returns populated `cvProfile.skills`
- Edit skills in UI
- Verify `PUT /profile` persists changes
- Re-fetch and confirm edits

### Manual validation (MVP acceptance)

- Test with 5-10 real CVs of varying formats
- Measure skill extraction accuracy (target =70% for well-formatted CVs)
- Verify no crashes on malformed PDFs

---

## Performance & cost estimates

| Resource | MVP estimate (per CV upload) | Cost |
| --- | --- | --- |
| Lambda execution | 512 MB, ~2-4 sec | ~$0.000017/upload |
| DynamoDB write | 1 WCU (< 1 KB `cvProfile`) | ~$0.0000013/upload |
| **Total per upload** | | **~$0.00002** |

For 100 CV uploads in MVP: **~$0.002** (negligible vs $50 budget).

Compare to Bedrock Nova Micro: **~$0.01-0.02/upload** ? 500-1000x more expensive.

---

## Open decisions resolved

| Decision | Choice |
| --- | --- |
| Inline vs separate endpoint | **Inline** in `parseCvPdf` |
| Skill dictionary storage | **Bundled `.ts` file** (MVP); S3 post-MVP |
| UI editing scope | **Skills only** (editable); experience/education read-only |
| Pattern matching library | **Native regex** (no heavy NLP) |
| Failed extract behavior | **Keep previous** `cvProfile`; log error |

---

## Security & compliance

- User can only extract/update their own `cvProfile` (enforce `userId` from JWT).
- No PII leakage in logs (truncate CV text in error messages).
- `cvProfile` attribute is within authenticated profile read/write permissions (no new IAM policies needed).

---

## Future enhancements (post-MVP)

- Add Textract for scanned/image PDFs (OCR).
- Use Bedrock for advanced extraction if budget increases.
- Editable experience/education in UI.
- Skill trend analysis and auto-suggestions.
- Support `.docx` format.
- Skill dictionary updates from admin panel.

