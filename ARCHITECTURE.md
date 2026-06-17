# Architecture Document
## Health Insurance Claims Processing System

---

## 1. System Overview

This system automates the processing of employee health insurance claims for Plum's Group Health Insurance product. It accepts a claim submission (member details, treatment information, uploaded documents), runs it through a multi-agent pipeline, and produces a structured decision with full explainability trace.

The system processes four types of outcomes:

- **APPROVED** — claim passes all checks, amount disbursed minus copay/discount
- **PARTIAL** — some line items covered, others excluded (e.g. dental with cosmetic procedures)
- **REJECTED** — clear policy violation (waiting period, exclusion, missing pre-auth)
- **MANUAL_REVIEW** — fraud signals or component failures requiring human review

---

## 2. Architecture Diagram

```
                ┌─────────────────────┐
                │   React Frontend     │
                │   (Vite, port 5173)  │
                └──────────┬──────────┘
                           │ POST /api/claims
                           ▼
                ┌─────────────────────┐
                │   Express Server     │
                │   (Node, port 3001)  │
                └──────────┬──────────┘
                           │
          ┌────────────────▼────────────────┐
          │         Pipeline Orchestrator    │
          └────────────────┬────────────────┘
                           │
          ┌────────────────▼────────────────┐
          │    Step 1: Document Verifier     │
          │  checks types, quality, patient  │
          └──────┬─────────────────┬────────┘
                 │ pass            │ fail
                 ▼                 ▼
          continue pipeline    return 400
                 │             with specific
                 │             error message
          ┌──────▼──────────────────────────┐
          │    Step 2: Document Parser       │
          │  Claude vision API extracts      │
          │  structured data from docs       │
          └──────────────┬──────────────────┘
                         │
      ┌──────────────────┼──────────────────┐
      │ Promise.all()    │                  │
      ▼                  ▼                  ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│   Step 3a     │ │   Step 3b     │ │   Step 3c     │
│  Eligibility  │ │  Adjudicator  │ │Fraud Detector │
│  member valid?│ │  covered?     │ │ flags &       │
│  waiting prd? │ │  amount calc  │ │ thresholds    │
│  limits?      │ │  exclusions?  │ │               │
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘
        │                 │                  │
        └─────────────────┼──────────────────┘
                          ▼
          ┌─────────────────────────────────┐
          │    Step 4: Decision Maker        │
          │  combines all results            │
          │  calculates final amount         │
          │  assigns confidence score        │
          │  builds full trace log           │
          └─────────────────────────────────┘
                          │
                          ▼
                ┌───────────────┐
                │  JSON Response │
                │  decision      │
                │  amount        │
                │  confidence    │
                │  trace[]       │
                └───────────────┘
```

---

## 3. Component Breakdown

### 3.1 Document Verifier (agents/docVerifier.js)

**Responsibility:** Gate that runs before any AI or business logic.

**Input:**

```js
{
  claim_category: "CONSULTATION",
  documents: [
    { file_id, file_name, actual_type, quality, patient_name_on_doc }
  ]
}
```

**Output:**

```js
{ blocked: false }
// or
{ blocked: true, reason: "WRONG_DOCUMENT_TYPE", message: "specific actionable message" }
```

**Checks (in order):**

1. Required document types present for this claim category (read from policy)
2. All documents are READABLE (not UNREADABLE quality)
3. Patient names consistent across all documents

**Design decision:** This agent runs first and can stop the pipeline immediately. This is intentional — there is no point running expensive AI parsing or business logic checks if the basic documents are wrong. Fail fast, fail specifically.

**Error messages are specific by design:** The assignment requires messages specific enough that the member knows exactly what to do next. Generic errors like "document error" are not acceptable.

---

### 3.2 Document Parser (agents/docParser.js)

**Responsibility:** Extract structured data from medical documents using Claude AI.

**Input:**

```js
[{ file_id, actual_type, base64Data?, mimeType?, content? }]
```

**Output:**

```js
{
  agent: "docParser",
  passed: true,
  documents: [
    { file_id, actual_type, extracted: { patient_name, diagnosis, ... }, source }
  ]
}
```

**Two operating modes:**

- **Test mode:** If document has a `content` field already, skip Claude and use it directly. This allows all 12 test cases to run without API calls or uploaded files.
- **Vision mode:** If document has `base64Data`, send to Claude Sonnet with a type-specific extraction prompt and parse the JSON response.

**Design decision:** Separating test mode from vision mode means the entire pipeline is testable without an API key or real documents. This is important for CI/CD and for running the eval report.

**Failure handling:** If Claude returns unparseable JSON, the agent returns `{ parse_error: true, raw_response }` and continues. The pipeline notes the failure in the trace but does not crash.

---

### 3.3 Eligibility Checker (agents/eligibility.js)

**Responsibility:** Verify the member and their claim are eligible under the policy.

**Input:**

```js
{
  member_id, claim_category, treatment_date,
  claimed_amount, ytd_claims_amount, diagnosis
}
```

**Output:**

```js
{
  agent: "eligibility",
  passed: true | false,
  checks: [{ rule, passed, detail }],
  rejection_reason: null | "MEMBER_NOT_FOUND" | "WAITING_PERIOD" | "PER_CLAIM_EXCEEDED" | "ANNUAL_LIMIT_EXCEEDED",
  rejection_detail: null | "human readable string"
}
```

**Checks (in order):**

1. Member exists in policy roster
2. Treatment date within policy active period
3. Initial 30-day waiting period cleared (read from policy)
4. Condition-specific waiting period cleared (diabetes=90d, maternity=270d etc.)
5. Per-claim limit not exceeded (skipped for DIAGNOSTIC, DENTAL, VISION)
6. Annual OPD limit not exceeded

**Key design decisions:**

- All limit values read from `policy_terms.json` — never hardcoded
- Per-claim limit skipped for DIAGNOSTIC/DENTAL/VISION because these categories have line-item level coverage rules handled by the adjudicator
- Excluded conditions skip the waiting period check — it is cleaner to say "not covered" than "waiting period not met" for something like bariatric surgery
- Dependents without a join_date inherit their primary member's join_date

---

### 3.4 Policy Adjudicator (agents/adjudicator.js)

**Responsibility:** Determine what is covered and calculate the approved amount.

**Input:**

```js
{
  claim_category, claimed_amount, hospital_name,
  line_items, diagnosis, treatment, pre_auth_obtained
}
```

**Output:**

```js
{
  agent: "adjudicator",
  passed: true | false,
  checks: [{ rule, passed, detail }],
  approved_amount: 3240,
  line_items: [{ description, claimed, approved, status, reason }],
  rejection_reason: null | "NOT_COVERED" | "EXCLUDED_CONDITION" | "PRE_AUTH_REQUIRED"
}
```

**Rules (in order):**

1. Category is covered in policy
2. Diagnosis/treatment not in exclusions list
3. Pre-authorization obtained for high-value diagnostic tests (MRI, CT, PET)
4. Line item level approval for DENTAL and VISION
5. Amount calculation

**Amount calculation order (critical):**

```
claimed_amount
  → Step 1: network discount (if hospital in network list)
      after_discount = amount × (1 - network_discount_percent/100)
  → Step 2: copay deduction
      approved = after_discount × (1 - copay_percent/100)
```

Network discount is applied FIRST, then copay on the discounted amount.

Example: ₹4500 at Apollo (20% network discount, 10% copay)

- ₹4500 × 0.80 = ₹3600 → ₹3600 × 0.90 = **₹3240 approved**

All percentages are read from `policy_terms.json`. No values are hardcoded.

---

### 3.5 Fraud Detector (agents/fraudDetector.js)

**Responsibility:** Flag suspicious claim patterns for manual review.

**Input:**

```js
{ member_id, claimed_amount, treatment_date, claims_history }
```

**Output:**

```js
{
  agent: "fraudDetector",
  passed: true,  // always true — fraud routes to MANUAL_REVIEW, not REJECTED
  fraud_score: 0.65,
  flags: [{ flag, detail, severity }],
  requires_manual_review: true | false
}
```

**Checks:**

1. Same-day claims count vs threshold (read from policy)
2. Monthly claims count vs threshold (read from policy)
3. High-value claim vs threshold (read from policy)

**Key design decision:** Fraud detection never causes a hard REJECTED decision. It sets `requires_manual_review: true` and the decision maker routes to MANUAL_REVIEW. This is intentional — fraud signals are probabilistic, not definitive. A human must make the final call on suspected fraud.

**Fraud score:** Additive score (0.0–1.0) where each flag adds weight. Score weights are internal to the agent and not in policy_terms.json because they are model parameters, not business rules.

---

### 3.6 Decision Maker (agents/decisionMaker.js)

**Responsibility:** Combine all agent results into a final decision with trace.

**Input:** Results from eligibility, adjudicator, fraud detector + any component failures

**Output:**

```js
{
  claim_id, decision, approved_amount, claimed_amount,
  confidence_score, reasons, rejection_reasons,
  line_items, trace, component_failures, recommendation
}
```

**Decision priority (in order):**

1. Eligibility failed → REJECTED
2. Adjudication failed → REJECTED
3. Fraud manual review → MANUAL_REVIEW
4. Mixed line items → PARTIAL
5. All clear → APPROVED

**Confidence scoring:**

- APPROVED/REJECTED: 0.92–0.95 (high confidence, clear rules)
- PARTIAL: 0.90 (slightly lower — involves line-item judgment)
- MANUAL_REVIEW: 0.70 (uncertainty by definition)
- Each component failure: −0.15 (degraded pipeline = less confidence)

---

### 3.7 Policy Loader (policyLoader.js)

**Responsibility:** Single source of truth for all policy data.

Reads `policy_terms.json` once on startup and caches it.

Exports helper functions used by all agents:

- `getPolicy()` — full policy object
- `getMember(id)` — member lookup
- `getCoverageCategory(category)` — OPD category rules
- `getWaitingPeriod(diagnosisText)` — keyword-based waiting period lookup
- `isNetworkHospital(name)` — fuzzy partial match against network list
- `getRequiredDocs(category)` — required/optional documents per claim type
- `getFraudThresholds()` — fraud detection limits

**All agents import from policyLoader** — no agent reads policy_terms.json directly. This means changing the policy file changes behavior everywhere with no code changes.

---

## 4. Key Design Decisions

### 4.1 Why multi-agent instead of one big function?

Each agent has a single clear responsibility. This means:

- Each agent can be tested independently
- Each agent can fail independently without crashing the others
- The trace log shows exactly which agent made which decision
- A new agent (e.g. a duplicate claim detector) can be added without touching existing agents

### 4.2 Why parallel execution for steps 3a/3b/3c?

Eligibility, adjudication, and fraud detection are independent of each other — none of them needs the output of the others. Running them with `Promise.all()` cuts processing time by roughly 3x compared to sequential execution.

`Promise.allSettled()` is used (not `Promise.all()`) so one agent failing does not cancel the others.

### 4.3 Why does fraud route to MANUAL_REVIEW instead of REJECTED?

Fraud signals are probabilistic indicators, not proof. A member submitting their 3rd claim on the same day might be experiencing a genuine medical emergency. Auto-rejecting based on pattern matching alone would be wrong. A human reviewer gets the flag and the full trace to make an informed decision.

### 4.4 Why does the Document Verifier run before the AI parser?

AI calls cost money and time. If the documents are wrong, there is no point parsing them. The verifier is pure logic (no API call), runs in milliseconds, and stops the pipeline with a specific, actionable error message before any resources are spent.

### 4.5 How is the system explainable?

Every agent appends to a `checks` array describing each rule it evaluated, whether it passed or failed, and why (in plain English). The decision maker assembles all agent results into a `trace` array in the final response. Any claim decision can be fully reconstructed by reading the trace alone.

### 4.6 How does it handle failures?

The server uses `Promise.allSettled()` for the parallel agents — if one throws, the others continue. Each failed agent is replaced with a safe default result (`passed: true`, no rejection) and recorded in `component_failures`. The confidence score is reduced by 0.15 per failure. If enough components fail, the decision maker recommends manual review.

The server itself has a global error handler that returns a structured error response instead of crashing.

---

## 5. What I Would Change at 10x Scale

### Current limitations:

- No database — claim history is passed in by the caller, not stored server-side
- No authentication — any caller can submit any member's claim
- No rate limiting — a single caller could flood the pipeline
- Single server process — no horizontal scaling
- No async job queue — long-running Claude vision calls block the request

### At 10x load (750,000+ claims/year):

**Add a job queue (BullMQ + Redis)**

Claims are submitted to a queue, processed asynchronously, and the caller polls for the result. This decouples submission from processing and handles traffic spikes gracefully.

**Add a database (PostgreSQL)**

Store claims, decisions, and member claim history server-side. Eliminates the need for callers to pass `claims_history` in the request.

**Add authentication (JWT)**

Members authenticate before submitting claims. Prevents unauthorized access.

**Horizontal scaling**

The pipeline is stateless — each request reads from the database and policy file. Multiple instances can run behind a load balancer.

**Cache the policy**

Policy is already cached in memory. At scale, use Redis so all instances share one cache and a policy update propagates instantly.

**Structured logging (not console.log)**

Replace `console.log` with a structured logger (Winston/Pino) that outputs JSON logs. Ship to a log aggregator for alerting and dashboards.

---

## 6. Limitations of Current Design

| Limitation | Impact | Fix |
|------------|--------|-----|
| No persistent storage | Claims history must be passed by caller | Add PostgreSQL |
| No auth | Any caller can submit any claim | Add JWT middleware |
| Synchronous pipeline | Claude vision blocks the request thread | Add job queue |
| No rate limiting | Vulnerable to flood | Add express-rate-limit |
| Single policy file | Policy changes require file edit + restart | Add policy admin API |
| No duplicate detection | Same claim can be submitted twice | Add claim deduplication |

---

## 7. Component Contracts

Every agent accepts and returns predictable shapes. Another engineer can reimplement any agent without reading its code, as long as the input/output contract is respected.

| Agent | Input | Output | Errors |
|-------|-------|--------|--------|
| docVerifier | claim_category, documents[] | { blocked, reason?, message? } | Never throws — returns blocked:true on all errors |
| docParser | documents[] | { agent, passed, documents[] } | Catches parse errors, returns parse_error:true |
| eligibility | claim, policy | { agent, passed, checks[], rejection_reason? } | Throws on unexpected errors (caught by server) |
| adjudicator | claim, policy | { agent, passed, checks[], approved_amount, line_items[] } | Throws on unexpected errors |
| fraudDetector | claim, policy | { agent, passed, fraud_score, flags[], requires_manual_review } | Always returns passed:true |
| decisionMaker | claim, elig, adj, fraud, failures? | { claim_id, decision, approved_amount, confidence_score, trace[] } | Throws on unexpected errors |
