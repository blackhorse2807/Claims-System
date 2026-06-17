# Eval Report — Health Insurance Claims Pipeline

**Generated:** 2026-06-17T13:57:09.138Z
**Total Tests:** 12
**Passed:** 0 | **Failed:** 12

---

## Summary Table

| Test ID | Description | Expected | Actual | Result |
|---------|-------------|----------|--------|--------|
| TC001 | Member submits two prescriptions for a consultatio | BLOCKED | ERROR | ❌ FAIL |
| TC002 | Member uploads a valid prescription but a blurry,  | BLOCKED | ERROR | ❌ FAIL |
| TC003 | The prescription is for Rajesh Kumar but the hospi | BLOCKED | ERROR | ❌ FAIL |
| TC004 | Complete, valid consultation claim with correct do | APPROVED | ERROR | ❌ FAIL |
| TC005 | Member joined 2024-09-01. Claims for diabetes trea | REJECTED | ERROR | ❌ FAIL |
| TC006 | Bill includes root canal treatment (covered) and t | PARTIAL | ERROR | ❌ FAIL |
| TC007 | MRI scan costing ₹15,000 submitted without pre-aut | REJECTED | ERROR | ❌ FAIL |
| TC008 | Claimed amount of ₹7,500 exceeds the per-claim lim | REJECTED | ERROR | ❌ FAIL |
| TC009 | Member EMP008 has already submitted 3 claims today | MANUAL_REVIEW | ERROR | ❌ FAIL |
| TC010 | Valid claim at Apollo Hospitals, a network hospita | APPROVED | ERROR | ❌ FAIL |
| TC011 | One component of your system fails mid-processing  | APPROVED | ERROR | ❌ FAIL |
| TC012 | Member claims for bariatric consultation and a die | REJECTED | ERROR | ❌ FAIL |

---

## Detailed Results

### TC001 — Member submits two prescriptions for a consultation claim that requires a prescription and a hospital bill.

**Result:** ❌ FAIL (379ms)

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

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---

### TC002 — Member uploads a valid prescription but a blurry, unreadable photo of their pharmacy bill.

**Result:** ❌ FAIL (9ms)

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

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---

### TC003 — The prescription is for Rajesh Kumar but the hospital bill is for a different patient, Arjun Mehta.

**Result:** ❌ FAIL (22ms)

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

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---

### TC004 — Complete, valid consultation claim with correct documents, valid member, covered treatment, within all limits.

**Result:** ❌ FAIL (6ms)

**Expected:**
```json
{
  "decision": "APPROVED",
  "approved_amount": 1350,
  "notes": "10% co-pay applied on consultation category (₹150 deducted)",
  "confidence_score": "above 0.85"
}
```

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---

### TC005 — Member joined 2024-09-01. Claims for diabetes treatment on 2024-10-15, which is within the 90-day waiting period for diabetes.

**Result:** ❌ FAIL (5ms)

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

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---

### TC006 — Bill includes root canal treatment (covered) and teeth whitening (cosmetic, excluded). System must approve only the covered procedure.

**Result:** ❌ FAIL (6ms)

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

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---

### TC007 — MRI scan costing ₹15,000 submitted without pre-authorization. Policy requires pre-auth for MRI above ₹10,000.

**Result:** ❌ FAIL (6ms)

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

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---

### TC008 — Claimed amount of ₹7,500 exceeds the per-claim limit of ₹5,000.

**Result:** ❌ FAIL (8ms)

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

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---

### TC009 — Member EMP008 has already submitted 3 claims today before this one arrives. This is the 4th claim from the same member on the same day.

**Result:** ❌ FAIL (8ms)

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

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---

### TC010 — Valid claim at Apollo Hospitals, a network hospital. Network discount must be applied before co-pay.

**Result:** ❌ FAIL (6ms)

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

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---

### TC011 — One component of your system fails mid-processing (simulate with the flag below). The overall pipeline must continue, produce a decision, and make the failure visible in the output with an appropriately reduced confidence score.

**Result:** ❌ FAIL (6ms)

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

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---

### TC012 — Member claims for bariatric consultation and a diet program. Obesity treatment is explicitly excluded under the policy.

**Result:** ❌ FAIL (4ms)

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

**Actual decision:** ERROR

**Why it failed:**
- fetch failed

---
