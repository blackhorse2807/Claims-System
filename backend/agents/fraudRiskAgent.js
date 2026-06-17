const policyService = require('../services/policyService');

const RISK_POINTS = {
  HIGH_VALUE_CLAIM: 20,
  DOCUMENT_ALTERATION: 40,
  MULTIPLE_CORRECTIONS: 30,
  AMOUNT_MISMATCH: 40,
  DUPLICATE_STAMP: 20,
  OVERWRITTEN_VALUES: 40,
  SUSPICIOUS_EDIT: 30,
  LOW_CONFIDENCE_DOCUMENTS: 20,
  CRITICAL_FIELDS_MISSING: 20,
  SAME_DAY_LIMIT_EXCEEDED: 30,
  MONTHLY_LIMIT_EXCEEDED: 30,
};

const DOCUMENT_FRAUD_SIGNALS = new Set([
  'DOCUMENT_ALTERATION',
  'MULTIPLE_CORRECTIONS',
  'AMOUNT_MISMATCH',
  'DUPLICATE_STAMP',
  'OVERWRITTEN_VALUES',
  'SUSPICIOUS_EDIT',
]);

const CRITICAL_FIELDS = [
  'patientName',
  'doctorRegistration',
  'billNumber',
  'totalAmount',
];

const DEFAULT_CLAIM_HISTORY = {
  getSameDayClaimCount() {
    return 0;
  },
  getMonthlyClaimCount() {
    return 0;
  },
};

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

function getPolicyFromInput(input) {
  return input?.policy || policyService.getPolicy();
}

function getFraudThresholds(policy) {
  return policy.fraud_detection || policy.fraud_thresholds || {};
}

function getClaimAmount(claim, financialResult) {
  const financialAmount = Number(financialResult?.claimedAmount);
  if (Number.isFinite(financialAmount) && financialAmount > 0) {
    return financialAmount;
  }

  const claimAmount = Number(claim?.claimedAmount ?? claim?.claimed_amount ?? 0);
  return Number.isFinite(claimAmount) ? claimAmount : 0;
}

function getTreatmentDate(claim) {
  return claim?.treatmentDate || claim?.treatment_date || null;
}

function collectDocumentFraudSignals(documentIntelligenceResult) {
  const documents = documentIntelligenceResult?.documents || [];
  const signals = [];

  for (const document of documents) {
    for (const signal of document?.fraudSignals || []) {
      const normalized = String(signal).trim().toUpperCase().replace(/\s+/g, '_');
      if (DOCUMENT_FRAUD_SIGNALS.has(normalized)) {
        signals.push(normalized);
      }
    }
  }

  return uniqueStrings(signals);
}

function hasCriticalFieldsMissing(documentIntelligenceResult) {
  const documents = documentIntelligenceResult?.documents || [];
  const missingFields = documents.flatMap((document) => document?.missingFields || []);

  if (CRITICAL_FIELDS.some((field) => missingFields.includes(field))) {
    return true;
  }

  for (const document of documents) {
    const data = document?.extractedData || {};
    const documentType = String(document?.documentType || '').toUpperCase();

    if (documentType === 'PRESCRIPTION') {
      if (!hasValue(data.patientName) || !hasValue(data.doctorRegistration)) {
        return true;
      }
    }

    if (documentType === 'HOSPITAL_BILL') {
      if (
        !hasValue(data.patientName) ||
        !hasValue(data.billNumber) ||
        !hasValue(data.totalAmount)
      ) {
        return true;
      }
    }
  }

  const aggregated = documentIntelligenceResult?.aggregatedExtraction || {};
  if (documents.length > 0 && !hasValue(aggregated.patientName)) {
    return true;
  }

  return false;
}

function hasValue(value) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  return true;
}

function calculateRiskScore(riskFlags) {
  let score = 0;

  for (const flag of uniqueStrings(riskFlags)) {
    score += RISK_POINTS[flag] || 0;
  }

  return score;
}

function determineRiskLevel(score) {
  if (score > 80) {
    return 'MANUAL_REVIEW';
  }

  if (score >= 51) {
    return 'HIGH';
  }

  if (score >= 21) {
    return 'MEDIUM';
  }

  return 'LOW';
}

/**
 * Hard rules that force manual review regardless of aggregate risk score.
 */
function evaluateManualReviewRules({
  sameDayCount,
  sameDayLimit,
  monthlyCount,
  monthlyLimit,
  documentFraudSignals,
}) {
  const manualReviewReasons = [];

  if (Number.isFinite(sameDayLimit) && sameDayCount > sameDayLimit) {
    manualReviewReasons.push(
      `Same-day claim count (${sameDayCount}) exceeds policy limit (${sameDayLimit})`
    );
  }

  if (Number.isFinite(monthlyLimit) && monthlyCount > monthlyLimit) {
    manualReviewReasons.push(
      `Monthly claim count (${monthlyCount}) exceeds policy limit (${monthlyLimit})`
    );
  }

  const hasDocumentAlteration = documentFraudSignals.includes('DOCUMENT_ALTERATION');
  const hasAmountMismatch = documentFraudSignals.includes('AMOUNT_MISMATCH');

  if (hasDocumentAlteration && hasAmountMismatch) {
    manualReviewReasons.push(
      'Document alteration detected together with amount mismatch'
    );
  }

  return {
    manualReviewReasons,
    manualReviewTriggeredByRule: manualReviewReasons.length > 0,
  };
}

/**
 * Fraud & Risk Agent — deterministic risk scoring for claims.
 *
 * @param {{
 *   claim: object,
 *   member: object,
 *   documentIntelligenceResult?: object,
 *   coverageResult?: object,
 *   financialResult?: object,
 *   policy?: object
 * }} input
 * @param {import('../types/claimIntake').TraceEntry[]} [existingTrace]
 * @param {{
 *   claimHistoryService?: {
 *     getSameDayClaimCount?: Function,
 *     getMonthlyClaimCount?: Function
 *   }
 * }} [options]
 */
function assessFraudRisk(input, existingTrace = [], options = {}) {
  const trace = [...existingTrace];
  const warnings = [];
  const riskFlags = [];

  try {
    const policy = getPolicyFromInput(input);
    const claim = input?.claim || {};
    const member = input?.member || {};
    const documentIntelligenceResult = input?.documentIntelligenceResult || {};
    const financialResult = input?.financialResult || {};
    const thresholds = getFraudThresholds(policy);
    const claimHistoryService = options.claimHistoryService || DEFAULT_CLAIM_HISTORY;

    const claimAmount = getClaimAmount(claim, financialResult);
    const highValueThreshold = Number(thresholds.high_value_claim_threshold);

    if (Number.isFinite(highValueThreshold) && claimAmount > highValueThreshold) {
      riskFlags.push('HIGH_VALUE_CLAIM');
      trace.push(
        createTraceEntry(
          'HIGH_VALUE_CHECK',
          'WARNING',
          `Claim amount ₹${claimAmount} exceeds threshold ₹${highValueThreshold}`
        )
      );
    } else if (!Number.isFinite(highValueThreshold)) {
      warnings.push('High value claim threshold not configured in policy');
      trace.push(
        createTraceEntry(
          'HIGH_VALUE_CHECK',
          'WARNING',
          'High value claim threshold not configured in policy'
        )
      );
    } else {
      trace.push(
        createTraceEntry(
          'HIGH_VALUE_CHECK',
          'PASS',
          `Claim amount ₹${claimAmount} within threshold ₹${highValueThreshold}`
        )
      );
    }

    const sameDayLimit = Number(thresholds.same_day_claims_limit);
    const monthlyLimit = Number(thresholds.monthly_claims_limit);
    const historyContext = { claim, member, policy };
    let sameDayCount = 0;
    let monthlyCount = 0;

    if (Number.isFinite(sameDayLimit)) {
      sameDayCount = Number(claimHistoryService.getSameDayClaimCount(historyContext) || 0);

      if (sameDayCount > sameDayLimit) {
        riskFlags.push('SAME_DAY_LIMIT_EXCEEDED');
        trace.push(
          createTraceEntry(
            'CLAIM_FREQUENCY_CHECK',
            'WARNING',
            `${sameDayCount} same-day claims on ${getTreatmentDate(claim) || 'unknown date'}, limit is ${sameDayLimit}`
          )
        );
      }
    } else {
      warnings.push('Same-day claims limit not configured in policy');
    }

    if (Number.isFinite(monthlyLimit)) {
      monthlyCount = Number(claimHistoryService.getMonthlyClaimCount(historyContext) || 0);

      if (monthlyCount > monthlyLimit) {
        riskFlags.push('MONTHLY_LIMIT_EXCEEDED');
        trace.push(
          createTraceEntry(
            'CLAIM_FREQUENCY_CHECK',
            'WARNING',
            `${monthlyCount} monthly claims, limit is ${monthlyLimit}`
          )
        );
      }
    } else {
      warnings.push('Monthly claims limit not configured in policy');
    }

    if (
      riskFlags.includes('SAME_DAY_LIMIT_EXCEEDED') ||
      riskFlags.includes('MONTHLY_LIMIT_EXCEEDED')
    ) {
      // trace already added above
    } else if (Number.isFinite(sameDayLimit) || Number.isFinite(monthlyLimit)) {
      trace.push(
        createTraceEntry('CLAIM_FREQUENCY_CHECK', 'PASS', 'Claim frequency within policy limits')
      );
    }

    const documentFraudSignals = collectDocumentFraudSignals(documentIntelligenceResult);
    riskFlags.push(...documentFraudSignals);

    if (documentFraudSignals.length > 0) {
      trace.push(
        createTraceEntry(
          'DOCUMENT_FRAUD_SIGNALS',
          'WARNING',
          `Document fraud signals detected: ${documentFraudSignals.join(', ')}`
        )
      );
    } else {
      trace.push(
        createTraceEntry('DOCUMENT_FRAUD_SIGNALS', 'PASS', 'No document fraud signals detected')
      );
    }

    const overallConfidence = Number(documentIntelligenceResult?.overallConfidence);
    const hasLowConfidenceDocument = (documentIntelligenceResult?.documents || []).some(
      (document) => Number(document?.overallDocumentConfidence) < 0.6
    );

    if (
      (Number.isFinite(overallConfidence) && overallConfidence < 0.6) ||
      hasLowConfidenceDocument
    ) {
      riskFlags.push('LOW_CONFIDENCE_DOCUMENTS');
      trace.push(
        createTraceEntry(
          'CONFIDENCE_CHECK',
          'WARNING',
          `Low document confidence detected (overall ${overallConfidence || 'unknown'})`
        )
      );
    } else if (!Number.isFinite(overallConfidence) && !(documentIntelligenceResult?.documents || []).length) {
      warnings.push('Document intelligence confidence unavailable');
      trace.push(
        createTraceEntry(
          'CONFIDENCE_CHECK',
          'WARNING',
          'Document intelligence confidence unavailable'
        )
      );
    } else {
      trace.push(
        createTraceEntry(
          'CONFIDENCE_CHECK',
          'PASS',
          `Document confidence acceptable (overall ${overallConfidence})`
        )
      );
    }

    if (hasCriticalFieldsMissing(documentIntelligenceResult)) {
      riskFlags.push('CRITICAL_FIELDS_MISSING');
      trace.push(
        createTraceEntry(
          'CONFIDENCE_CHECK',
          'WARNING',
          `Critical fields missing: ${CRITICAL_FIELDS.join(', ')}`
        )
      );
    }

    const normalizedRiskFlags = uniqueStrings(riskFlags);
    const riskScore = calculateRiskScore(normalizedRiskFlags);
    let riskLevel = determineRiskLevel(riskScore);

    const manualReviewRules = evaluateManualReviewRules({
      sameDayCount,
      sameDayLimit,
      monthlyCount,
      monthlyLimit,
      documentFraudSignals,
    });

    const requiresManualReview =
      riskLevel === 'MANUAL_REVIEW' || manualReviewRules.manualReviewTriggeredByRule;

    if (manualReviewRules.manualReviewTriggeredByRule) {
      riskLevel = 'MANUAL_REVIEW';
      trace.push(
        createTraceEntry(
          'MANUAL_REVIEW_OVERRIDE',
          'WARNING',
          manualReviewRules.manualReviewReasons.join('; ')
        )
      );
    } else {
      trace.push(
        createTraceEntry(
          'MANUAL_REVIEW_OVERRIDE',
          'PASS',
          'No hard manual review rules triggered'
        )
      );
    }

    trace.push(
      createTraceEntry(
        'RISK_SCORING',
        requiresManualReview ? 'WARNING' : 'PASS',
        `Risk score ${riskScore} => ${riskLevel}`
      )
    );

    return {
      riskScore,
      riskLevel,
      riskFlags: normalizedRiskFlags,
      requiresManualReview,
      manualReviewReasons: manualReviewRules.manualReviewReasons,
      manualReviewTriggeredByRule: manualReviewRules.manualReviewTriggeredByRule,
      warnings: uniqueStrings(warnings),
      trace,
      claim,
      member,
      documentIntelligenceResult,
      coverageResult: input?.coverageResult || null,
      financialResult,
    };
  } catch (error) {
    const message = error.message || 'Fraud risk assessment failed';
    warnings.push(message);
    trace.push(createTraceEntry('RISK_SCORING', 'FAIL', message));

    return {
      riskScore: 0,
      riskLevel: 'LOW',
      riskFlags: [],
      requiresManualReview: false,
      manualReviewReasons: [],
      manualReviewTriggeredByRule: false,
      warnings: uniqueStrings(warnings),
      trace,
      claim: input?.claim || null,
      member: input?.member || null,
      documentIntelligenceResult: input?.documentIntelligenceResult || null,
      coverageResult: input?.coverageResult || null,
      financialResult: input?.financialResult || null,
      error: message,
    };
  }
}

module.exports = {
  assessFraudRisk,
  calculateRiskScore,
  determineRiskLevel,
  evaluateManualReviewRules,
  collectDocumentFraudSignals,
  hasCriticalFieldsMissing,
  createTraceEntry,
  RISK_POINTS,
};
