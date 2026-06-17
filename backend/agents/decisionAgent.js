function createTraceEntry(step, status, message) {
  return {
    step,
    status,
    message,
    timestamp: new Date().toISOString(),
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function roundAmount(value) {
  return Math.round(Number(value) * 100) / 100;
}

function getClaimedAmount(claim, financialResult) {
  const financialClaimed = Number(financialResult?.claimedAmount);
  if (Number.isFinite(financialClaimed)) {
    return roundAmount(financialClaimed);
  }

  const claimAmount = Number(claim?.claimedAmount ?? claim?.claimed_amount ?? 0);
  return roundAmount(Number.isFinite(claimAmount) ? claimAmount : 0);
}

function getApprovedAmount(financialResult) {
  const approved = Number(financialResult?.approvedAmount ?? financialResult?.approved_amount ?? 0);
  return roundAmount(Number.isFinite(approved) ? approved : 0);
}

function getPatientPayable(financialResult, claimedAmount, approvedAmount) {
  const payable = Number(financialResult?.patientPayable);
  if (Number.isFinite(payable)) {
    return roundAmount(payable);
  }

  return roundAmount(Math.max(claimedAmount - approvedAmount, 0));
}

function getConfidence(documentIntelligenceResult) {
  const confidence = Number(documentIntelligenceResult?.overallConfidence);
  if (Number.isFinite(confidence) && confidence >= 0 && confidence <= 1) {
    return confidence;
  }

  return 0.8;
}

function mapFraudFlagToReason(flag) {
  const reasonsByFlag = {
    HIGH_VALUE_CLAIM: 'High value claim requires additional review',
    DOCUMENT_ALTERATION: 'Document alteration detected',
    MULTIPLE_CORRECTIONS: 'Multiple corrections detected on submitted documents',
    AMOUNT_MISMATCH: 'Document amount mismatch detected',
    DUPLICATE_STAMP: 'Duplicate stamp detected on documents',
    OVERWRITTEN_VALUES: 'Overwritten values detected on documents',
    SUSPICIOUS_EDIT: 'Suspicious document edits detected',
    LOW_CONFIDENCE_DOCUMENTS: 'Low confidence document extraction',
    CRITICAL_FIELDS_MISSING: 'Critical document fields are missing',
    SAME_DAY_LIMIT_EXCEEDED: 'Same-day claim frequency limit exceeded',
    MONTHLY_LIMIT_EXCEEDED: 'Monthly claim frequency limit exceeded',
  };

  return reasonsByFlag[flag] || `Risk flag raised: ${flag}`;
}

function mapAdjustmentToReason(adjustment) {
  if (adjustment?.description) {
    return adjustment.description;
  }

  const descriptions = {
    SUB_LIMIT: 'Category sub-limit reduced payable amount',
    PER_CLAIM_LIMIT: 'Per-claim limit reduced payable amount',
    ANNUAL_LIMIT: 'Annual OPD limit reduced payable amount',
    FAMILY_FLOATER: 'Family floater limit reduced payable amount',
    NETWORK_DISCOUNT: 'Network discount applied before copay',
    COPAY: 'Copay reduced insurer payable amount',
  };

  return descriptions[adjustment?.type] || `Financial adjustment applied: ${adjustment?.type}`;
}

function formatCoverageFailure(failure) {
  if (typeof failure === 'string') {
    return failure;
  }

  if (failure?.code === 'WAITING_PERIOD') {
    return `${failure.diagnosis}: coverage available from ${failure.eligibleFromDate}`;
  }

  return failure.message || JSON.stringify(failure);
}

function buildReasons({
  decision,
  coverageResult,
  financialResult,
  fraudResult,
}) {
  const reasons = [];

  if (decision === 'REJECTED' && coverageResult?.eligible === false) {
    for (const failure of coverageResult?.coverageFailures || []) {
      reasons.push(formatCoverageFailure(failure));
    }

    if (reasons.length === 0) {
      reasons.push('Claim is not eligible for coverage');
    }
  }

  if (decision === 'MANUAL_REVIEW') {
    reasons.push('Manual review required due to fraud risk assessment');

    for (const flag of fraudResult?.riskFlags || []) {
      reasons.push(mapFraudFlagToReason(flag));
    }
  }

  if (decision === 'REJECTED' && coverageResult?.eligible !== false) {
    const approvedAmount = getApprovedAmount(financialResult);
    if (approvedAmount <= 0) {
      reasons.push('No payable amount remained after financial adjudication');
    }
  }

  if (decision === 'PARTIAL_APPROVED' || decision === 'APPROVED' || decision === 'REJECTED') {
    for (const adjustment of financialResult?.adjustments || []) {
      if (adjustment?.amountReduced > 0) {
        reasons.push(mapAdjustmentToReason(adjustment));
      }
    }
  }

  if (decision === 'PARTIAL_APPROVED') {
    reasons.push('Approved amount is lower than the claimed amount');
  }

  if (decision === 'APPROVED') {
    reasons.push('Claim approved for the full adjudicated amount');
  }

  return uniqueStrings(reasons);
}

function buildWarnings(coverageResult, fraudResult, financialResult) {
  return uniqueStrings([
    ...(coverageResult?.coverageWarnings || []),
    ...(fraudResult?.warnings || []),
    ...(financialResult?.warnings || []),
  ]);
}

function determineDecision({
  coverageResult,
  financialResult,
  fraudResult,
  claimedAmount,
  approvedAmount,
}) {
  if (coverageResult?.eligible === false) {
    return 'REJECTED';
  }

  if (fraudResult?.requiresManualReview === true) {
    return 'MANUAL_REVIEW';
  }

  if (approvedAmount <= 0) {
    return 'REJECTED';
  }

  if (approvedAmount < claimedAmount) {
    return 'PARTIAL_APPROVED';
  }

  return 'APPROVED';
}

/**
 * Decision Agent — produces the final claim decision from upstream agent results.
 *
 * @param {{
 *   claim: object,
 *   member?: object,
 *   coverageResult: object,
 *   financialResult: object,
 *   fraudResult: object,
 *   documentIntelligenceResult?: object
 * }} input
 * @param {import('../types/claimIntake').TraceEntry[]} [existingTrace]
 */
function makeClaimDecision(input, existingTrace = []) {
  const trace = [...existingTrace];
  const warnings = [];

  try {
    const claim = input?.claim || {};
    const member = input?.member || null;
    const coverageResult = input?.coverageResult || {};
    const financialResult = input?.financialResult || {};
    const fraudResult = input?.fraudResult || {};
    const documentIntelligenceResult = input?.documentIntelligenceResult || null;

    const claimedAmount = getClaimedAmount(claim, financialResult);
    const approvedAmount = getApprovedAmount(financialResult);
    const patientPayable = getPatientPayable(financialResult, claimedAmount, approvedAmount);
    const riskLevel = fraudResult?.riskLevel || 'LOW';
    const confidence = getConfidence(documentIntelligenceResult);

    const decision = determineDecision({
      coverageResult,
      financialResult,
      fraudResult,
      claimedAmount,
      approvedAmount,
    });

    const reasons = buildReasons({
      decision,
      coverageResult,
      financialResult,
      fraudResult,
    });

    warnings.push(...buildWarnings(coverageResult, fraudResult, financialResult));

    trace.push(
      createTraceEntry(
        'FINAL_DECISION',
        decision === 'REJECTED' ? 'FAIL' : decision === 'MANUAL_REVIEW' ? 'WARNING' : 'PASS',
        `Final decision: ${decision} (claimed ₹${claimedAmount}, approved ₹${approvedAmount})`
      )
    );

    return {
      decision,
      claimedAmount,
      approvedAmount: decision === 'MANUAL_REVIEW' ? approvedAmount : decision === 'REJECTED' ? 0 : approvedAmount,
      patientPayable,
      reasons,
      warnings: uniqueStrings(warnings),
      riskLevel,
      confidence,
      trace,
      claim,
      member,
      coverageResult,
      financialResult,
      fraudResult,
    };
  } catch (error) {
    const message = error.message || 'Decision processing failed';
    warnings.push(message);

    trace.push(createTraceEntry('FINAL_DECISION', 'FAIL', message));

    const claimedAmount = getClaimedAmount(input?.claim || {}, input?.financialResult || {});

    return {
      decision: 'REJECTED',
      claimedAmount,
      approvedAmount: 0,
      patientPayable: claimedAmount,
      reasons: [message],
      warnings: uniqueStrings(warnings),
      riskLevel: input?.fraudResult?.riskLevel || 'LOW',
      confidence: getConfidence(input?.documentIntelligenceResult),
      trace,
      claim: input?.claim || null,
      member: input?.member || null,
      coverageResult: input?.coverageResult || null,
      financialResult: input?.financialResult || null,
      fraudResult: input?.fraudResult || null,
      error: message,
    };
  }
}

module.exports = {
  makeClaimDecision,
  determineDecision,
  buildReasons,
  getConfidence,
  createTraceEntry,
};
