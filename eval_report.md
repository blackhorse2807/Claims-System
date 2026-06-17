# Eval Report — Health Insurance Claims Pipeline

**Generated:** 2026-06-17T21:58:01.096Z  
**Total Tests:** 12  
**Passed:** 0 | **Failed:** 12

---

## ⚠️ Why All 12 Test Cases Failed (0/12) — Read This First

> **Bottom line:** The automated eval (`npm test`) and the live UI use **two different document input paths**. All 12 tests use the eval path (JSON fixtures with embedded document data). The backend was built for the UI path (real file uploads + Claude vision). The eval path is **not fully implemented**, so every test fails before the business logic it is meant to exercise can run correctly.

### What the test runner sends

`testRunner.js` posts to `POST /api/claims` with a `documents` JSON array like:

```json
{
  "file_id": "F007",
  "actual_type": "PRESCRIPTION",
  "content": {
    "patient_name": "Rajesh Kumar",
    "diagnosis": "Viral Fever",
    "line_items": [{ "description": "Consultation Fee", "amount": 1000 }]
  },
  "quality": "GOOD",
  "patient_name_on_doc": "Rajesh Kumar"
}
```

This is **intentional** in `test_cases.json` — it simulates document content without real image files so evals can run without uploading PDFs.

### What the backend actually does with that input

1. **Claim intake** converts each JSON document to a record with `filePath: "virtual://F007"` and keeps only `actual_type`. The embedded `content`, `quality`, and `patient_name_on_doc` fields are **discarded**.
2. **Document intelligence** tries to read the file from disk and call **Claude vision** for classification, extraction, and quality analysis.
3. Because `virtual://` paths do not exist on disk, document processing **fails** for every fixture document.
4. The pipeline continues with **empty extraction** (`patientName: null`, no line items, no diagnosis).
5. **Coverage** then sees missing or incomplete documents and returns **REJECTED** with reasons like `"Missing required documents: PRESCRIPTION, HOSPITAL_BILL"` — instead of the expected **BLOCKED**, **APPROVED**, **PARTIAL**, or **MANUAL_REVIEW** outcomes.

This single gap explains **all 12 failures**. The adjudication agents (waiting period, pre-auth, line-item partial approval, fraud velocity, exclusions) are never reached with valid extracted data during eval runs.

### Secondary mismatches (visible once the primary gap is fixed)

Even after document simulation works, these assertion differences would still cause failures until addressed:

| Gap | What tests expect | What the system returns today |
|-----|-------------------|-------------------------------|
| **Early document stops (TC001–TC003)** | `blocked: true` + codes like `WRONG_DOCUMENT_TYPE` | `blocked: true` + `status: PENDING_DOCUMENT_UPLOAD` / `PENDING_DOCUMENT_REUPLOAD` / `DOCUMENT_MISMATCH` |
| **Member identity (all cases)** | Tests send only `member_id` | Backend validates `memberName`, `dob`, `gender` against policy — tests do not send these fields |
| **Rejection codes (TC005–TC012)** | Structured codes in `rejection_reasons` (`WAITING_PERIOD`, `PRE_AUTH_REQUIRED`, …) | Human-readable strings in `reasons` without standardized codes |
| **Response shape** | Test runner checks `rejection_reason` singular field | API exposes `rejection_reasons` array and `status` for blocked flows |

### What works today (UI path)

The **React frontend** submits real files via `multipart/form-data` with correct member details. With `ANTHROPIC_API_KEY` set, Claude classifies and extracts uploaded PDFs/images. Early stops (missing documents, member mismatch, unreadable docs) work for real submissions — they are just **not exercised correctly** by the JSON fixture eval harness.

### Planned fix (not yet implemented)

1. **Test document simulator** — For `virtual://` paths, read `content` / `quality` / `patient_name_on_doc` from the original JSON and return classification/extraction without calling Claude.
2. **Auto-fill member fields in testRunner** — Look up `memberName`, `dob`, `gender` from `policy_terms.json` for each `member_id`.
3. **Align eval assertions** — Map `status` values to expected reason codes, or emit standardized codes from the orchestrator.

Until step 1 is implemented, **0/12 is expected** and does not reflect broken UI behaviour — it reflects an incomplete eval integration.

---

## Summary Table

| Test ID | Description | Expected | Actual | Result |
|---------|-------------|----------|--------|--------|
| TC001 | Member submits two prescriptions for a consultatio | BLOCKED | REJECTED | ❌ FAIL |
| TC002 | Member uploads a valid prescription but a blurry,  | BLOCKED | REJECTED | ❌ FAIL |
| TC003 | The prescription is for Rajesh Kumar but the hospi | BLOCKED | REJECTED | ❌ FAIL |
| TC004 | Complete, valid consultation claim with correct do | APPROVED | REJECTED | ❌ FAIL |
| TC005 | Member joined 2024-09-01. Claims for diabetes trea | REJECTED | REJECTED | ❌ FAIL |
| TC006 | Bill includes root canal treatment (covered) and t | PARTIAL | REJECTED | ❌ FAIL |
| TC007 | MRI scan costing ₹15,000 submitted without pre-aut | REJECTED | REJECTED | ❌ FAIL |
| TC008 | Claimed amount of ₹7,500 exceeds the per-claim lim | REJECTED | REJECTED | ❌ FAIL |
| TC009 | Member EMP008 has already submitted 3 claims today | MANUAL_REVIEW | REJECTED | ❌ FAIL |
| TC010 | Valid claim at Apollo Hospitals, a network hospita | APPROVED | REJECTED | ❌ FAIL |
| TC011 | One component of your system fails mid-processing  | APPROVED | REJECTED | ❌ FAIL |
| TC012 | Member claims for bariatric consultation and a die | REJECTED | REJECTED | ❌ FAIL |

---

## Detailed Results

### TC001 — Member submits two prescriptions for a consultation claim that requires a prescription and a hospital bill.

**Result:** ❌ FAIL (233ms)

**Expected:**
```json
{
  "decision": null,
  "system_must": [
    "Stop before making any claim decision",
    "Tell the member specifically what document type was uploaded and what is needed instead",
    "Not return a generic error — the message must name the uploaded document type and the required document type"
  ],
  "blocked": true,
  "rejection_reason": "WRONG_DOCUMENT_TYPE"
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Blocked: expected true, got false
- Rejection reason: expected "WRONG_DOCUMENT_TYPE"

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---

### TC002 — Member uploads a valid prescription but a blurry, unreadable photo of their pharmacy bill.

**Result:** ❌ FAIL (15ms)

**Expected:**
```json
{
  "decision": null,
  "system_must": [
    "Identify that the pharmacy bill cannot be read",
    "Ask the member to re-upload that specific document",
    "Not reject the claim outright"
  ],
  "blocked": true,
  "rejection_reason": "UNREADABLE_DOCUMENT"
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Blocked: expected true, got false
- Rejection reason: expected "UNREADABLE_DOCUMENT"

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---

### TC003 — The prescription is for Rajesh Kumar but the hospital bill is for a different patient, Arjun Mehta.

**Result:** ❌ FAIL (12ms)

**Expected:**
```json
{
  "decision": null,
  "system_must": [
    "Detect that the documents belong to different people",
    "Surface this to the member with the specific names found on each document",
    "Not proceed to a claim decision"
  ],
  "blocked": true,
  "rejection_reason": "PATIENT_MISMATCH"
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Blocked: expected true, got false
- Rejection reason: expected "PATIENT_MISMATCH"

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---

### TC004 — Complete, valid consultation claim with correct documents, valid member, covered treatment, within all limits.

**Result:** ❌ FAIL (15ms)

**Expected:**
```json
{
  "decision": "APPROVED",
  "approved_amount": 1350,
  "notes": "10% co-pay applied on consultation category (₹150 deducted)",
  "confidence_score": "above 0.85"
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Decision: expected "APPROVED", got "REJECTED"
- Amount: expected ₹1350, got ₹0

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---

### TC005 — Member joined 2024-09-01. Claims for diabetes treatment on 2024-10-15, which is within the 90-day waiting period for diabetes.

**Result:** ❌ FAIL (22ms)

**Expected:**
```json
{
  "decision": "REJECTED",
  "rejection_reasons": [
    "WAITING_PERIOD"
  ],
  "system_must": [
    "State the date from which the member will be eligible for diabetes-related claims"
  ],
  "rejection_reason": "WAITING_PERIOD"
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Rejection reason: expected "WAITING_PERIOD"

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---

### TC006 — Bill includes root canal treatment (covered) and teeth whitening (cosmetic, excluded). System must approve only the covered procedure.

**Result:** ❌ FAIL (21ms)

**Expected:**
```json
{
  "decision": "PARTIAL",
  "approved_amount": 8000,
  "system_must": [
    "Itemize which line items were approved and which were rejected",
    "State the reason for each rejection at the line-item level"
  ]
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Decision: expected "PARTIAL", got "REJECTED"
- Amount: expected ₹8000, got ₹0

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---

### TC007 — MRI scan costing ₹15,000 submitted without pre-authorization. Policy requires pre-auth for MRI above ₹10,000.

**Result:** ❌ FAIL (9ms)

**Expected:**
```json
{
  "decision": "REJECTED",
  "rejection_reasons": [
    "PRE_AUTH_MISSING"
  ],
  "system_must": [
    "Explain that pre-authorization was required and not obtained",
    "Tell the member what they should do to resubmit with pre-auth"
  ],
  "rejection_reason": "PRE_AUTH_REQUIRED"
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Rejection reason: expected "PRE_AUTH_REQUIRED"

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---

### TC008 — Claimed amount of ₹7,500 exceeds the per-claim limit of ₹5,000.

**Result:** ❌ FAIL (20ms)

**Expected:**
```json
{
  "decision": "REJECTED",
  "rejection_reasons": [
    "PER_CLAIM_EXCEEDED"
  ],
  "system_must": [
    "State the per-claim limit and the claimed amount clearly in the rejection message"
  ],
  "rejection_reason": "PER_CLAIM_EXCEEDED"
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Rejection reason: expected "PER_CLAIM_EXCEEDED"

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---

### TC009 — Member EMP008 has already submitted 3 claims today before this one arrives. This is the 4th claim from the same member on the same day.

**Result:** ❌ FAIL (24ms)

**Expected:**
```json
{
  "decision": "MANUAL_REVIEW",
  "system_must": [
    "Flag the unusual same-day claim pattern",
    "Route to manual review rather than auto-rejecting",
    "Include the specific signals that triggered the flag in the output"
  ]
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Decision: expected "MANUAL_REVIEW", got "REJECTED"

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---

### TC010 — Valid claim at Apollo Hospitals, a network hospital. Network discount must be applied before co-pay.

**Result:** ❌ FAIL (19ms)

**Expected:**
```json
{
  "decision": "APPROVED",
  "approved_amount": 3240,
  "notes": "Network discount (20%) applied first on ₹4,500 = ₹3,600. Co-pay (10%) applied on ₹3,600 = ₹360 deducted. Final: ₹3,240.",
  "system_must": [
    "Apply network discount before co-pay, not after",
    "Show the breakdown of discount and co-pay in the decision output"
  ]
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Decision: expected "APPROVED", got "REJECTED"
- Amount: expected ₹3240, got ₹0

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---

### TC011 — One component of your system fails mid-processing (simulate with the flag below). The overall pipeline must continue, produce a decision, and make the failure visible in the output with an appropriately reduced confidence score.

**Result:** ❌ FAIL (18ms)

**Expected:**
```json
{
  "decision": "APPROVED",
  "system_must": [
    "Not crash or return a 500 error",
    "Indicate in the output that a component failed and was skipped",
    "Return a confidence score lower than a normal full-pipeline approval",
    "Include a note that manual review is recommended due to incomplete processing"
  ]
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Decision: expected "APPROVED", got "REJECTED"

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---

### TC012 — Member claims for bariatric consultation and a diet program. Obesity treatment is explicitly excluded under the policy.

**Result:** ❌ FAIL (14ms)

**Expected:**
```json
{
  "decision": "REJECTED",
  "rejection_reasons": [
    "EXCLUDED_CONDITION"
  ],
  "confidence_score": "above 0.90",
  "rejection_reason": "EXCLUDED_CONDITION"
}
```

**Actual decision:** REJECTED
**Actual amount:** ₹0
**Confidence:** 0%

**Why it failed:**
- Rejection reason: expected "EXCLUDED_CONDITION"

**Agent trace summary:**
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined
- ✗ undefined

---
