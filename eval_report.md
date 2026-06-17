# Eval Report — Health Insurance Claims Pipeline

**Generated:** 2026-06-17T10:09:47.988Z
**Total Tests:** 12
**Passed:** 12 | **Failed:** 0

---

## Summary Table

| Test ID | Description | Expected | Actual | Result |
|---------|-------------|----------|--------|--------|
| TC001 | Member submits two prescriptions for a consultatio | BLOCKED | BLOCKED | ✅ PASS |
| TC002 | Member uploads a valid prescription but a blurry,  | BLOCKED | BLOCKED | ✅ PASS |
| TC003 | The prescription is for Rajesh Kumar but the hospi | BLOCKED | BLOCKED | ✅ PASS |
| TC004 | Complete, valid consultation claim with correct do | APPROVED | APPROVED | ✅ PASS |
| TC005 | Member joined 2024-09-01. Claims for diabetes trea | REJECTED | REJECTED | ✅ PASS |
| TC006 | Bill includes root canal treatment (covered) and t | PARTIAL | PARTIAL | ✅ PASS |
| TC007 | MRI scan costing ₹15,000 submitted without pre-aut | REJECTED | REJECTED | ✅ PASS |
| TC008 | Claimed amount of ₹7,500 exceeds the per-claim lim | REJECTED | REJECTED | ✅ PASS |
| TC009 | Member EMP008 has already submitted 3 claims today | MANUAL_REVIEW | MANUAL_REVIEW | ✅ PASS |
| TC010 | Valid claim at Apollo Hospitals, a network hospita | APPROVED | APPROVED | ✅ PASS |
| TC011 | One component of your system fails mid-processing  | APPROVED | APPROVED | ✅ PASS |
| TC012 | Member claims for bariatric consultation and a die | REJECTED | REJECTED | ✅ PASS |

---

## Detailed Results

### TC001 — Member submits two prescriptions for a consultation claim that requires a prescription and a hospital bill.

**Result:** ✅ PASS (77ms)

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

**Actual decision:** WRONG_DOCUMENT_TYPE

---

### TC002 — Member uploads a valid prescription but a blurry, unreadable photo of their pharmacy bill.

**Result:** ✅ PASS (6ms)

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

**Actual decision:** UNREADABLE_DOCUMENT

---

### TC003 — The prescription is for Rajesh Kumar but the hospital bill is for a different patient, Arjun Mehta.

**Result:** ✅ PASS (7ms)

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

**Actual decision:** PATIENT_MISMATCH

---

### TC004 — Complete, valid consultation claim with correct documents, valid member, covered treatment, within all limits.

**Result:** ✅ PASS (11ms)

**Expected:**
```json
{
  "decision": "APPROVED",
  "approved_amount": 1350,
  "notes": "10% co-pay applied on consultation category (₹150 deducted)",
  "confidence_score": "above 0.85"
}
```

**Actual decision:** APPROVED
**Actual amount:** ₹1350
**Confidence:** 92%

**Agent trace summary:**
- ✓ eligibility
- ✓ adjudicator
- ✓ fraudDetector

---

### TC005 — Member joined 2024-09-01. Claims for diabetes treatment on 2024-10-15, which is within the 90-day waiting period for diabetes.

**Result:** ✅ PASS (8ms)

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
**Confidence:** 95%

**Agent trace summary:**
- ✗ eligibility
  - Diabetes has 90-day waiting period. Member eligible from 2024-11-30
- ✓ adjudicator
- ✓ fraudDetector

---

### TC006 — Bill includes root canal treatment (covered) and teeth whitening (cosmetic, excluded). System must approve only the covered procedure.

**Result:** ✅ PASS (5ms)

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

**Actual decision:** PARTIAL
**Actual amount:** ₹8000
**Confidence:** 90%

**Agent trace summary:**
- ✓ eligibility
- ✓ adjudicator
- ✓ fraudDetector

---

### TC007 — MRI scan costing ₹15,000 submitted without pre-authorization. Policy requires pre-auth for MRI above ₹10,000.

**Result:** ✅ PASS (8ms)

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
**Confidence:** 95%

**Agent trace summary:**
- ✓ eligibility
- ✗ adjudicator
  - Pre-authorization required for MRI/CT Scan/PET Scan when claim exceeds ₹10000
- ✓ fraudDetector

---

### TC008 — Claimed amount of ₹7,500 exceeds the per-claim limit of ₹5,000.

**Result:** ✅ PASS (7ms)

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
**Confidence:** 95%

**Agent trace summary:**
- ✗ eligibility
  - Claimed ₹7500 exceeds per-claim limit of ₹5000
- ✓ adjudicator
- ✓ fraudDetector

---

### TC009 — Member EMP008 has already submitted 3 claims today before this one arrives. This is the 4th claim from the same member on the same day.

**Result:** ✅ PASS (10ms)

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

**Actual decision:** MANUAL_REVIEW
**Actual amount:** ₹4320
**Confidence:** 70%

**Agent trace summary:**
- ✓ eligibility
- ✓ adjudicator
- ✓ fraudDetector

---

### TC010 — Valid claim at Apollo Hospitals, a network hospital. Network discount must be applied before co-pay.

**Result:** ✅ PASS (8ms)

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

**Actual decision:** APPROVED
**Actual amount:** ₹3240
**Confidence:** 92%

**Agent trace summary:**
- ✓ eligibility
- ✓ adjudicator
- ✓ fraudDetector

---

### TC011 — One component of your system fails mid-processing (simulate with the flag below). The overall pipeline must continue, produce a decision, and make the failure visible in the output with an appropriately reduced confidence score.

**Result:** ✅ PASS (7ms)

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

**Actual decision:** APPROVED
**Actual amount:** ₹4000
**Confidence:** 77%

**Agent trace summary:**
- ✓ eligibility
- ✓ adjudicator
- ✓ fraudDetector

---

### TC012 — Member claims for bariatric consultation and a diet program. Obesity treatment is explicitly excluded under the policy.

**Result:** ✅ PASS (5ms)

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
**Confidence:** 95%

**Agent trace summary:**
- ✓ eligibility
- ✗ adjudicator
  - Claim rejected — "Obesity and weight loss programs" is excluded by policy
- ✓ fraudDetector

---
