# Health Insurance Claims Processing System

Automated multi-agent pipeline for processing employee health insurance claims against policy rules (`PLUM_GHI_2024`), with a React submission UI, full agent trace observability, and Claude-powered document intelligence.

**Repository:** [github.com/blackhorse2807/Claims-System](https://github.com/blackhorse2807/Claims-System)

---

## Deliverables

### 1. Working System

#### Deployed

| Component | URL |
|-----------|-----|
| **Backend API** | https://claims-system-31s9.onrender.com |
| Health check | https://claims-system-31s9.onrender.com/health |
| Claims endpoint | `POST https://claims-system-31s9.onrender.com/api/claims` |

The frontend is configured to use the Render backend in production builds. For a hosted UI, deploy the `frontend/` folder to Vercel/Netlify and set `VITE_API_URL=https://claims-system-31s9.onrender.com`.

#### Local setup

**Prerequisites:** Node.js 18+, Anthropic API key (required for real document uploads)

```bash
# Clone
git clone https://github.com/blackhorse2807/Claims-System.git
cd Claims-System/claims-system   # or cd into repo root if structure differs

# Backend
cd backend
npm install
cp .env.example .env             # if present; otherwise create backend/.env
# Set: ANTHROPIC_API_KEY=sk-ant-...
npm start                        # http://localhost:3001

# Frontend (new terminal)
cd ../frontend
npm install
npm run dev                      # http://localhost:5173
```

**Frontend env** (`frontend/.env`):

```
VITE_API_URL=http://localhost:3001
```

For production builds pointing at Render:

```
VITE_API_URL=https://claims-system-31s9.onrender.com
```

#### What the UI supports

- Multi-step claim wizard: applicant details → claim type → type-specific form → summary → submit
- Document upload (PDF/JPG/PNG) with per-claim-type requirements
- Decision view with approved amount, confidence, reasons, line-item breakdown
- Full agent trace (expandable)
- Status-specific recovery actions:
  - `PENDING_DOCUMENT_UPLOAD` → **Upload Missing Document** (reopens form, highlights missing types)
  - `MEMBER_DETAILS_MISMATCH` → **Correct Member Details** (returns to applicant step with mismatch table)

#### Run eval tests

```bash
cd backend
npm test                         # runs testRunner.js against localhost:3001
```

Generates `eval_report.md` at the repo root.

---

### 2. Architecture Document

#### Overview

The system accepts a claim (member details, treatment metadata, uploaded documents), runs it through a **sequential agent pipeline** orchestrated by a single service, and returns a structured decision with a step-by-step trace. Early-exit paths prevent wasted AI calls and give members actionable feedback before a final adjudication decision.

#### Pipeline

```
React Frontend (Vite)
        │  POST /api/claims  (multipart FormData)
        ▼
Express Server (server.js)
        │
        ▼
claimProcessingOrchestrator.js
        │
        ├─ 1. claimIntake              Schema validation, normalization, claim ID
        ├─ 2. memberValidationAgent    Member lookup, identity, dates, policy active
        │      ↳ STOP: MEMBER_DETAILS_MISMATCH
        ├─ 3. documentIntelligenceAgent Classification → extraction → quality (Claude)
        │      ↳ STOP: DOCUMENT_MISMATCH (patient name inconsistency)
        ├─ 4. evaluateDocumentRequirements (coveragePolicyAgent)
        │      ↳ STOP: PENDING_DOCUMENT_UPLOAD | PENDING_DOCUMENT_REUPLOAD
        ├─ 5. coveragePolicyAgent      Waiting period, exclusions, pre-auth, category rules
        ├─ 6. financialAdjudicationAgent Network discount, copay, caps, line-item adjudication
        ├─ 7. fraudRiskAgent           Velocity limits, document alteration, amount mismatch
        └─ 8. decisionAgent            Final decision, confidence, reasons, trace assembly
```

#### Components and responsibilities

| Layer | Role |
|-------|------|
| **Frontend** | Wizard UX, client-side date/policy hard-stops, FormData assembly, decision display |
| **server.js** | HTTP, multer file upload, response formatting |
| **Orchestrator** | Stage ordering, early stops, persistence to `backend/data/claims/` |
| **Agents** | Pure(ish) business logic units — each appends to a shared trace |
| **Services** | Shared infra: `policyService`, `anthropicService`, classifier/extractor/quality |
| **policy_terms.json** | Single source of truth for members, limits, exclusions, waiting periods |

#### Design decisions

**Chosen: Agent pipeline with orchestrator**

Each stage is a separate module with a narrow contract. The orchestrator owns flow control and early exits. This makes traces natural (each agent appends steps) and lets you swap implementations (e.g. mock document services in tests).

**Chosen: Policy as JSON, not hardcoded**

All limits, member records, exclusions, and category rules live in `policy_terms.json`. Agents read through `policyService` — no magic numbers in agent code.

**Chosen: Early document gates before coverage/financial**

Document completeness, unreadability, and patient consistency stop the pipeline *before* coverage and financial agents run. This matches real claims ops (don't adjudicate incomplete files) and saves LLM/API cost on doomed claims.

**Chosen: Blocked vs decided outcomes**

`blocked: true` with `decision: null` for recoverable document/member issues. Full `decision` (APPROVED/REJECTED/PARTIAL/MANUAL_REVIEW) only when the pipeline completes.

**Rejected: Monolithic single-pass LLM**

We considered one big prompt that classifies, extracts, and adjudicates in one call. Rejected because it hurts observability, makes partial failure hard to handle, and mixes policy logic with vision tasks.

**Rejected: Database for v1**

Claims persist as JSON files under `backend/data/claims/`. Sufficient for demo/eval; would move to Postgres at scale.

#### Limitations and 10× scale path

| Limitation | At 10× load |
|------------|-------------|
| Synchronous pipeline per request | Queue (SQS/RabbitMQ) + worker pool; API returns `claim_id` immediately, poll/webhook for result |
| Sequential document AI calls | Parallelize per-document steps; cache classification by document hash |
| File storage on disk | S3 + pre-signed uploads; virus scan queue |
| JSON policy/member data | Postgres + Redis cache for hot policy terms |
| No auth | OAuth2 / member portal SSO |
| Render cold starts | Dedicated compute, keep-warm, or move to ECS/K8s |
| Single Anthropic key, no rate-limit handling | Retry with backoff, request queuing, fallback model tier |

---

### 3. Component Contracts

Each contract below is sufficient to reimplement the component without reading its source.

---

#### `claimIntake` (`agents/claimIntake.js`)

**Input**

```typescript
{
  body: Record<string, unknown>,   // form fields (snake_case or camelCase)
  files?: MulterFile[],            // multipart uploads
  jsonDocuments?: object[]         // eval/test documents array
}
```

**Output** — `AgentResult<NormalizedClaim>`

```typescript
{
  success: boolean,
  data?: {
    claim: {
      claimId: string,
      memberId: string,
      relationship: string,
      claimType: string,           // CONSULTATION | DIAGNOSTIC | ...
      claimedAmount: number,
      treatmentDate: string,       // ISO date
      submissionDate: string,
      uploadedDocuments: UploadedDocument[],
      metadata: Record<string, string>  // memberName, dob, gender, hospitalName, ...
    }
  },
  error?: string,
  trace: TraceEntry[]
}
```

**Errors / failures**

- Missing required fields (member ID, relationship, claim type, amount, dates, documents)
- Invalid claim type
- Amount ≤ 0

**Trace steps:** `CLAIM_RECEIVED`, `SCHEMA_VALIDATION`, `NORMALIZATION`

---

#### `memberValidationAgent` (`agents/memberValidationAgent.js`)

**Input:** `NormalizedClaim`, optional existing trace

**Output** — `AgentResult<{ claim, member, validation }>`

```typescript
{
  success: boolean,
  blocked?: boolean,
  identityMismatch?: boolean,
  status?: 'MEMBER_DETAILS_MISMATCH',
  mismatches?: { field: string, submitted: string, expected: string }[],
  reasons?: string[],
  data?: {
    member: { memberId, name, relationship, joinDate, dateOfBirth, gender },
    validation: { memberFound, relationshipValid, identityValid, ... }
  },
  error?: string,
  trace: TraceEntry[]
}
```

**Errors / early stops**

- Member not found
- Relationship mismatch
- Identity mismatch (name / DOB / gender vs policy record)
- Treatment date before join date
- Submission outside 30-day window
- Policy not active on treatment date

**Trace steps:** `MEMBER_LOOKUP`, `RELATIONSHIP_CHECK`, `MEMBER_NAME_CHECK`, `DOB_CHECK`, `GENDER_CHECK`, `TREATMENT_DATE`, `SUBMISSION_DEADLINE`, `POLICY_ACTIVE`

---

#### `documentIntelligenceAgent` (`agents/documentIntelligenceAgent.js`)

**Input**

```typescript
{
  claim: NormalizedClaim,
  member: Member,
  uploadedDocuments: UploadedDocument[]
}
// optional services override: classifyFn, extractFn, qualityFn, resolveFileInput
```

**Output**

```typescript
{
  success: boolean,
  documents: ProcessedDocument[],      // per-file classification + extraction + quality
  aggregatedExtraction: {
    patientName, diagnosis[], procedures[], medicines[],
    tests[], doctors[], hospitals[], treatmentDate, totalClaimAmount
  },
  overallConfidence: number,
  patientConsistencyCheck: { passed, issue, details, message },
  warnings: string[],
  trace: TraceEntry[]
}
```

**Errors**

- Individual document processing failures are captured per-document (warnings, zero confidence) — pipeline continues unless orchestrator stops on patient mismatch

**Trace steps:** `DOCUMENT_CLASSIFICATION`, `DOCUMENT_EXTRACTION`, `DOCUMENT_QUALITY_CHECK`, `PATIENT_CONSISTENCY_CHECK`, `DOCUMENT_AGGREGATION`

---

#### `evaluateDocumentRequirements` (`agents/coveragePolicyAgent.js`)

**Input:** `{ claim, policy, documentIntelligenceResult }`

**Output**

```typescript
{
  actionRequired: boolean,
  status: 'PENDING_DOCUMENT_UPLOAD' | 'PENDING_DOCUMENT_REUPLOAD' | null,
  uploadedDocumentTypes: string[],
  missingDocumentTypes: string[],
  documents: { fileName, reason }[],   // unreadable docs
  message: string,
  trace: TraceEntry[]
}
```

**Trace steps:** `DOCUMENT_REUPLOAD_REQUIRED`, `DOCUMENT_COMPLETENESS_CHECK`

---

#### `coveragePolicyAgent` (`agents/coveragePolicyAgent.js`)

**Input:** `{ claim, member, validation, documentIntelligenceResult, policy }`

**Output**

```typescript
{
  success: boolean,
  covered: boolean,
  coverageFailures: (string | { code: 'WAITING_PERIOD', eligibleFromDate: string, ... })[],
  coverageWarnings: string[],
  coverageChecks: Record<string, boolean>,
  trace: TraceEntry[]
}
```

**Trace steps:** `CATEGORY_COVERAGE`, `WAITING_PERIOD`, `WAITING_PERIOD_CALCULATION`, `PROCEDURE_COVERAGE`, `EXCLUSION_CHECK`, `PRE_AUTHORIZATION`

---

#### `financialAdjudicationAgent` (`agents/financialAdjudicationAgent.js`)

**Input:** `{ claim, member, coverageResult, documentIntelligenceResult, policy }`

**Output**

```typescript
{
  success: boolean,
  approvedAmount: number,
  lineItemDecisions?: { description, claimed, approved, status, reason }[],
  adjustments: { type: string, amount: number, reason: string }[],
  warnings: string[],
  trace: TraceEntry[]
}
```

**Trace steps:** `BASE_AMOUNT`, `NETWORK_DISCOUNT`, `LINE_ITEM_ADJUDICATION`, `COPAY`, `PER_CLAIM_LIMIT`, `ANNUAL_LIMIT`

---

#### `fraudRiskAgent` (`agents/fraudRiskAgent.js`)

**Input:** `{ claim, member, documentIntelligenceResult, coverageResult, financialResult, policy }`

**Output**

```typescript
{
  success: boolean,
  riskScore: number,                 // 0–1
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'MANUAL_REVIEW',
  riskFlags: string[],
  manualReviewTriggeredByRule?: boolean,
  warnings: string[],
  trace: TraceEntry[]
}
```

**Hard rules → MANUAL_REVIEW:** same-day claim velocity, monthly limit, `DOCUMENT_ALTERATION`, `AMOUNT_MISMATCH`

---

#### `decisionAgent` (`agents/decisionAgent.js`)

**Input:** `{ claim, coverageResult, financialResult, fraudResult, documentIntelligenceResult }`

**Output**

```typescript
{
  success: boolean,
  decision: 'APPROVED' | 'PARTIAL' | 'REJECTED' | 'MANUAL_REVIEW',
  claimedAmount: number,
  approvedAmount: number,
  patientPayable: number,
  confidence: number,
  reasons: string[],
  trace: TraceEntry[]
}
```

**Trace step:** `FINAL_DECISION`

---

#### `claimProcessingOrchestrator` (`services/claimProcessingOrchestrator.js`)

**Input**

```typescript
{
  claimPayload: object,
  uploadedDocuments: { files?: File[], jsonDocuments?: object[] }
}
```

**Output** — unified response (blocked or final)

```typescript
{
  success: boolean,
  blocked: boolean,
  stage?: string,                    // e.g. DOCUMENT_REQUIREMENTS, MEMBER_IDENTITY_VALIDATION
  status?: string,                   // e.g. PENDING_DOCUMENT_UPLOAD
  claimId: string,
  decision: string | null,
  approvedAmount, claimedAmount, patientPayable,
  confidence, reasons, warnings,
  trace: TraceEntry[],
  mismatches?, missingDocumentTypes?, documentIntelligenceResult?, ...
}
```

---

#### Shared types

```typescript
TraceEntry = {
  step: string,
  status: 'PASS' | 'FAIL' | 'WARNING',
  message: string,
  timestamp: string   // ISO 8601
}
```

---

### 4. Eval Report

> ## ⚠️ Why 0/12 — All Test Cases Failed
>
> **The eval harness and the live UI use different document input paths.** This is the primary reason every test case fails. It is **not** a sign that the UI or agent pipeline is entirely broken — it means the automated eval integration is incomplete.
>
> | Path | How documents are sent | Backend behaviour | Status |
> |------|------------------------|-------------------|--------|
> | **UI (production)** | Real PDF/JPG/PNG files via `multipart/form-data` | Claude vision classifies & extracts | ✅ Works |
> | **Eval (`npm test`)** | JSON fixtures with embedded `content`, `quality`, `patient_name_on_doc` | Backend ignores embedded data, tries to read `virtual://` files from disk, AI fails | ❌ Not implemented |
>
> **What happens during `npm test`:**
>
> 1. `testRunner.js` sends `documents` as a JSON string (see `test_cases.json`).
> 2. Claim intake keeps only `actual_type` and sets `filePath: "virtual://F001"` — **`content`, `quality`, and `patient_name_on_doc` are dropped**.
> 3. Document intelligence calls Claude on non-existent files → extraction returns empty.
> 4. Coverage rejects with `"Missing required documents…"` → **REJECTED** instead of expected **BLOCKED / APPROVED / PARTIAL / MANUAL_REVIEW**.
> 5. Tests TC004–TC012 never reach waiting-period, pre-auth, line-item, fraud, or exclusion logic with valid data.
>
> **Secondary gaps** (after fixing document simulation):
> - Tests omit `memberName` / `dob` / `gender` but backend validates identity against policy records.
> - Tests expect rejection codes (`WAITING_PERIOD`, `PRE_AUTH_REQUIRED`); API returns human-readable `reasons`.
> - Tests expect `blocked` + `WRONG_DOCUMENT_TYPE`; API returns `status: PENDING_DOCUMENT_UPLOAD`.
>
> **Planned fix:** Test document simulator for `virtual://` paths + member auto-fill in testRunner + aligned assertion mapping.
>
> Full per-case traces: [`eval_report.md`](./eval_report.md)

**Last run:** 2026-06-17 · **Environment:** local backend (`localhost:3001`)

| Result | Count |
|--------|-------|
| **Passed** | 0 |
| **Failed** | 12 |
| **Total** | 12 |

Full trace and per-case detail: [`eval_report.md`](./eval_report.md)

#### Summary table

| ID | Case | Expected | Actual | Match |
|----|------|----------|--------|-------|
| TC001 | Wrong document uploaded | BLOCKED | REJECTED | ❌ |
| TC002 | Unreadable document | BLOCKED | REJECTED | ❌ |
| TC003 | Patient mismatch across docs | BLOCKED | REJECTED | ❌ |
| TC004 | Clean consultation approval | APPROVED ₹1,350 | REJECTED ₹0 | ❌ |
| TC005 | Waiting period | REJECTED (WAITING_PERIOD) | REJECTED (wrong reason) | ❌ |
| TC006 | Partial dental | PARTIAL ₹8,000 | REJECTED ₹0 | ❌ |
| TC007 | Pre-auth missing | REJECTED (PRE_AUTH_REQUIRED) | REJECTED (wrong reason) | ❌ |
| TC008 | Per-claim limit | REJECTED (PER_CLAIM_EXCEEDED) | REJECTED (wrong reason) | ❌ |
| TC009 | Same-day velocity | MANUAL_REVIEW | REJECTED | ❌ |
| TC010 | Network hospital approval | APPROVED ₹3,240 | REJECTED ₹0 | ❌ |
| TC011 | Component failure graceful | APPROVED (degraded) | REJECTED | ❌ |
| TC012 | Excluded condition | REJECTED (EXCLUDED_CONDITION) | REJECTED (wrong reason) | ❌ |

#### Root cause detail (same as eval report)

See the **“Why All 12 Test Cases Failed”** section at the top of [`eval_report.md`](./eval_report.md) for the full explanation. In short:

1. **Primary cause:** JSON fixture documents are not simulated — AI is invoked on missing files → empty extraction → blanket REJECTED.
2. **TC001–TC003:** Expected early **blocked** responses; got **REJECTED** because document intelligence never succeeded on fixtures.
3. **TC004–TC012:** Expected **APPROVED / PARTIAL / MANUAL_REVIEW** or specific rejection codes; got **REJECTED** at coverage because extracted document data was empty.
4. **Assertion mismatch:** Even correct pipeline behaviour uses `status` (e.g. `PENDING_DOCUMENT_UPLOAD`) rather than the reason codes the test runner checks for.

**Re-run after fixes**

```bash
cd backend
npm start          # terminal 1
npm test           # terminal 2
```

To test against Render:

```bash
# After updating testRunner.js to read CLAIMS_SERVER_URL
CLAIMS_SERVER_URL=https://claims-system-31s9.onrender.com/api/claims npm test
```

---

### 5. Demo Video (8–12 minutes)

> **Status:** Not yet recorded. Suggested script below.

| Segment | Time | Content |
|---------|------|---------|
| **Intro** | 0:00–1:00 | System purpose, deployed URL, stack overview |
| **Document problem (early stop)** | 1:00–4:00 | Submit DENTAL claim with only a prescription → show `PENDING_DOCUMENT_UPLOAD`, missing `HOSPITAL_BILL` highlighted, **Upload Missing Document** flow |
| **Successful approval** | 4:00–8:00 | Submit valid CONSULTATION with prescription + hospital bill for EMP001 (Rajesh Kumar, correct DOB/gender) → APPROVED, amount, copay, expand full trace |
| **Technical deep-dive** | 8:00–11:00 | **Proud of:** early-exit orchestrator + trace-per-step observability. **Would change:** JSON test-document simulator from day one; async job queue for AI steps |
| **Wrap-up** | 11:00–12:00 | Eval status, GitHub link, known limitations |

---

## Evaluation Criteria Mapping

| Criteria | Weight | How this project addresses it |
|----------|--------|-------------------------------|
| **System Design** | 30% | Orchestrated agent pipeline, policy-as-data, early exits, separated agents/services |
| **Engineering Quality** | 25% | Typed JSDoc contracts, structured responses, frontend validation (Zod), persistent claim results |
| **Observability** | 20% | Every stage appends `TraceEntry` with step/status/message/timestamp; expandable UI trace |
| **AI Integration** | 15% | Claude for classify/extract/quality only; JSON-validated outputs; per-document failure isolation |
| **Document Verification** | 10% | Completeness, unreadability, patient consistency, member identity checks before adjudication |

---

## Project Structure

```
claims-system/
├── backend/
│   ├── server.js                          Express API
│   ├── testRunner.js                      12-case eval runner
│   ├── policyLoader.js                    Policy JSON loader
│   ├── agents/
│   │   ├── claimIntake.js
│   │   ├── memberValidationAgent.js
│   │   ├── documentIntelligenceAgent.js
│   │   ├── coveragePolicyAgent.js
│   │   ├── financialAdjudicationAgent.js
│   │   ├── fraudRiskAgent.js
│   │   └── decisionAgent.js
│   ├── services/
│   │   ├── claimProcessingOrchestrator.js
│   │   ├── policyService.js
│   │   ├── documentClassifier.js
│   │   ├── documentExtractor.js
│   │   ├── qualityAnalyzer.js
│   │   └── anthropicService.js
│   └── data/claims/                         Persisted claim results
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── DecisionView.jsx
│       ├── TraceView.jsx
│       └── components/                      Wizard + claim-type pages
├── policy_terms.json                        Policy source of truth
├── test_cases.json                          12 eval scenarios
└── eval_report.md                           Generated by npm test
```

---

## API Reference

### `GET /api/members`

Returns enrolled members from policy data.

### `GET /health`

Returns `{ status: "ok" }`.

### `POST /api/claims`

Accepts `multipart/form-data` (UI) or `application/x-www-form-urlencoded` (test runner).

**Key fields:** `memberId`, `memberName`, `dob`, `gender`, `relationship`, `claimType`, `treatmentDate`, `claimedAmount`, `hospitalName`, `files[]`, `doc_type_N`, `documents` (JSON string for eval)

**Blocked response (example)**

```json
{
  "success": false,
  "blocked": true,
  "stage": "DOCUMENT_REQUIREMENTS",
  "status": "PENDING_DOCUMENT_UPLOAD",
  "missingDocumentTypes": ["HOSPITAL_BILL"],
  "message": "Hospital Bill is required.",
  "trace": [...]
}
```

**Approved response (example)**

```json
{
  "success": true,
  "blocked": false,
  "decision": "APPROVED",
  "approved_amount": 1350,
  "claimed_amount": 1500,
  "confidence_score": 0.92,
  "reasons": ["10% copay applied"],
  "trace": [...]
}
```

---

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `ANTHROPIC_API_KEY` | backend `.env` / Render | Claude vision for document AI |
| `PORT` | backend | Server port (default 3001) |
| `VITE_API_URL` | frontend `.env` | Backend base URL |

---

## License

Internal / assessment submission — Plum Group Health Insurance claims processing prototype.
