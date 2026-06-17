# Claims Pipeline — Automated Eval Report

**Generated:** 2026-06-17T23:00:21.136Z
**Runner:** `scripts/runAllEvaluations.js` → `claimProcessingOrchestrator()`

## Summary

- **Passed:** 12/12
- **Failed:** 0/12

| Test ID | Case | Expected | Actual | Result |
|---------|------|----------|--------|--------|
| TC001 | Wrong Document Uploaded | BLOCKED | BLOCKED (PENDING_DOCUMENT_UPLOAD) | ✅ PASS |
| TC002 | Unreadable Document | BLOCKED | BLOCKED (PENDING_DOCUMENT_REUPLOAD) | ✅ PASS |
| TC003 | Documents Belong to Different Patients | BLOCKED | BLOCKED (DOCUMENT_MISMATCH) | ✅ PASS |
| TC004 | Clean Consultation — Full Approval | APPROVED | APPROVED | ✅ PASS |
| TC005 | Waiting Period — Diabetes | REJECTED | REJECTED | ✅ PASS |
| TC006 | Dental Partial Approval — Cosmetic Exclusion | PARTIAL | PARTIAL | ✅ PASS |
| TC007 | MRI Without Pre-Authorization | REJECTED | REJECTED | ✅ PASS |
| TC008 | Per-Claim Limit Exceeded | REJECTED | REJECTED | ✅ PASS |
| TC009 | Fraud Signal — Multiple Same-Day Claims | MANUAL_REVIEW | MANUAL_REVIEW | ✅ PASS |
| TC010 | Network Hospital — Discount Applied | APPROVED | APPROVED | ✅ PASS |
| TC011 | Component Failure — Graceful Degradation | APPROVED | APPROVED | ✅ PASS |
| TC012 | Excluded Treatment | REJECTED | REJECTED | ✅ PASS |
