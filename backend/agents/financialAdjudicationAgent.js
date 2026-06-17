const policyService = require('../services/policyService');

const DEFAULT_CLAIM_HISTORY = {
  getAnnualUsedAmount() {
    return 0;
  },
  getFamilyFloaterUsedAmount() {
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

function roundAmount(value) {
  return Math.round(Number(value) * 100) / 100;
}

function normalizeClaimType(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}

function getPolicyFromInput(input) {
  return input?.policy || policyService.getPolicy();
}

function getCoverageLimits(policy) {
  return policy.coverage_limits || policy.coverage || {};
}

function getClaimType(claim) {
  return normalizeClaimType(claim?.claimType || claim?.claim_category);
}

function getClaimedAmountFromClaim(claim) {
  const amount = Number(claim?.claimedAmount ?? claim?.claimed_amount ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function getHospitalName(claim, documentIntelligenceResult) {
  const metadata = claim?.metadata || {};
  const aggregated = documentIntelligenceResult?.aggregatedExtraction || {};
  const documents = documentIntelligenceResult?.documents || [];

  if (metadata.hospitalName) {
    return metadata.hospitalName;
  }

  if (claim?.hospital_name || claim?.hospitalName) {
    return claim.hospital_name || claim.hospitalName;
  }

  if (aggregated.hospitals?.length) {
    return aggregated.hospitals[0];
  }

  for (const document of documents) {
    const hospitalName = document?.extractedData?.hospitalName;
    if (hospitalName) {
      return hospitalName;
    }
  }

  return null;
}

function isNetworkHospital(hospitalName, policy) {
  const hospitals = policy.network_hospitals || [];
  const name = String(hospitalName || '').toLowerCase().trim();

  if (!name) {
    return false;
  }

  return hospitals.some((hospital) => {
    const networkName = (typeof hospital === 'string' ? hospital : hospital.name || '')
      .toLowerCase()
      .trim();
    return networkName.includes(name) || name.includes(networkName);
  });
}

/**
 * Determine the financial base amount from extracted bills or the claim.
 * @param {object} claim
 * @param {object} documentIntelligenceResult
 */
function determineBaseAmount(claim, documentIntelligenceResult) {
  const fallbackAmount = getClaimedAmountFromClaim(claim);
  const documents = documentIntelligenceResult?.documents || [];

  for (const document of documents) {
    if (document?.documentType === 'HOSPITAL_BILL') {
      const totalAmount = Number(document?.extractedData?.totalAmount);
      if (Number.isFinite(totalAmount) && totalAmount > 0) {
        return {
          amount: roundAmount(totalAmount),
          source: 'HOSPITAL_BILL',
        };
      }
    }
  }

  const aggregatedTotal = Number(
    documentIntelligenceResult?.aggregatedExtraction?.totalClaimAmount
  );
  if (Number.isFinite(aggregatedTotal) && aggregatedTotal > 0) {
    return {
      amount: roundAmount(aggregatedTotal),
      source: 'AGGREGATED_EXTRACTION',
    };
  }

  return {
    amount: roundAmount(fallbackAmount),
    source: 'CLAIM',
  };
}

function getCategoryRules(policy, claimType) {
  const categories = policy.opd_categories || {};
  return categories[claimType.toLowerCase()] || {};
}

function partialMatch(textA, textB) {
  if (!textA || !textB) {
    return false;
  }

  const lowerA = String(textA).toLowerCase();
  const lowerB = String(textB).toLowerCase();
  return lowerA.includes(lowerB) || lowerB.includes(lowerA);
}

function findMatchingListItem(texts, items) {
  for (const text of texts) {
    for (const item of items || []) {
      if (partialMatch(text, item)) {
        return item;
      }
    }
  }

  return null;
}

/**
 * Collect bill line items from extracted hospital bill documents.
 * @param {object} documentIntelligenceResult
 */
function extractHospitalBillLineItems(documentIntelligenceResult) {
  const lineItems = [];
  const documents = documentIntelligenceResult?.documents || [];

  for (const document of documents) {
    if (String(document?.documentType || '').toUpperCase() !== 'HOSPITAL_BILL') {
      continue;
    }

    const extractedItems = document?.extractedData?.lineItems || [];
    for (const item of extractedItems) {
      const description = String(item?.description || item?.name || '').trim();
      const amount = Number(item?.amount ?? item?.rate ?? 0);

      if (!description || !Number.isFinite(amount) || amount <= 0) {
        continue;
      }

      lineItems.push({
        description,
        amount: roundAmount(amount),
      });
    }
  }

  return lineItems;
}

/**
 * Evaluate a single dental bill line item against policy procedure lists.
 * @param {string} description
 * @param {object} policy
 */
function evaluateDentalLineItem(description, policy) {
  const categoryRules = getCategoryRules(policy, 'DENTAL');
  const excludedProcedures = [
    ...(policy.exclusions?.dental_exclusions || []),
    ...(categoryRules.excluded_procedures || []),
  ];
  const coveredProcedures = categoryRules.covered_procedures || [];

  if (findMatchingListItem([description], excludedProcedures)) {
    return {
      decision: 'REJECTED',
      reason: 'Cosmetic procedure excluded',
    };
  }

  if (findMatchingListItem([description], coveredProcedures)) {
    return {
      decision: 'APPROVED',
      reason: 'Covered dental procedure',
    };
  }

  return {
    decision: 'REJECTED',
    reason: 'Procedure not covered under dental policy',
  };
}

/**
 * Evaluate a single vision bill line item against policy item lists.
 * @param {string} description
 * @param {object} policy
 */
function evaluateVisionLineItem(description, policy) {
  const categoryRules = getCategoryRules(policy, 'VISION');
  const excludedItems = [
    ...(policy.exclusions?.vision_exclusions || []),
    ...(categoryRules.excluded_items || []),
  ];
  const coveredItems = categoryRules.covered_items || [];

  if (findMatchingListItem([description], excludedItems)) {
    return {
      decision: 'REJECTED',
      reason: 'Excluded vision item',
    };
  }

  if (findMatchingListItem([description], coveredItems)) {
    return {
      decision: 'APPROVED',
      reason: 'Covered vision item',
    };
  }

  return {
    decision: 'REJECTED',
    reason: 'Vision item not covered under policy',
  };
}

/**
 * Evaluate each hospital bill line item for dental or vision claims.
 * @param {object[]} lineItems
 * @param {string} claimType
 * @param {object} policy
 */
function evaluateLineItems(lineItems, claimType, policy) {
  const normalizedClaimType = normalizeClaimType(claimType);

  return lineItems.map((item) => {
    let evaluation;

    if (normalizedClaimType === 'DENTAL') {
      evaluation = evaluateDentalLineItem(item.description, policy);
    } else if (normalizedClaimType === 'VISION') {
      evaluation = evaluateVisionLineItem(item.description, policy);
    } else {
      evaluation = {
        decision: 'APPROVED',
        reason: 'Line item approved by default',
      };
    }

    return {
      description: item.description,
      amount: item.amount,
      decision: evaluation.decision,
      reason: evaluation.reason,
    };
  });
}

function supportsLineItemEvaluation(claimType) {
  const normalizedClaimType = normalizeClaimType(claimType);
  return normalizedClaimType === 'DENTAL' || normalizedClaimType === 'VISION';
}

function sumLineItemAmounts(lineItemDecisions, decisionFilter = null) {
  return roundAmount(
    lineItemDecisions
      .filter((item) => (decisionFilter ? item.decision === decisionFilter : true))
      .reduce((sum, item) => sum + item.amount, 0)
  );
}

function getCopayPercent(claim, categoryRules) {
  const claimType = getClaimType(claim);
  const brandedDrug =
    claim?.metadata?.brandedDrug === true ||
    claim?.brandedDrug === true ||
    String(claim?.metadata?.drugType || '').toLowerCase() === 'branded';

  if (claimType === 'PHARMACY' && brandedDrug) {
    const brandedCopay = Number(categoryRules.branded_drug_copay_percent);
    if (Number.isFinite(brandedCopay)) {
      return brandedCopay;
    }
  }

  const copayPercent = Number(categoryRules.copay_percent);
  return Number.isFinite(copayPercent) ? copayPercent : 0;
}

function applyCap({
  runningAmount,
  limit,
  type,
  description,
  adjustments,
  trace,
}) {
  if (!Number.isFinite(limit) || runningAmount <= limit) {
    return runningAmount;
  }

  const amountReduced = roundAmount(runningAmount - limit);
  adjustments.push({
    type,
    description,
    amountReduced,
  });
  trace.push(createTraceEntry(type, 'PASS', description));

  return limit;
}

function applyPercentageReduction({
  runningAmount,
  percent,
  type,
  description,
  adjustments,
  trace,
}) {
  if (!Number.isFinite(percent) || percent <= 0 || runningAmount <= 0) {
    return runningAmount;
  }

  const amountReduced = roundAmount(runningAmount * (percent / 100));
  const nextAmount = roundAmount(runningAmount - amountReduced);

  adjustments.push({
    type,
    description,
    amountReduced,
  });
  trace.push(createTraceEntry(type, 'PASS', description));

  return nextAmount;
}

/**
 * Financial Adjudication Agent — calculates payable amounts using policy rules.
 *
 * @param {{
 *   claim: object,
 *   member: object,
 *   coverageResult?: object,
 *   documentIntelligenceResult?: object,
 *   policy?: object
 * }} input
 * @param {import('../types/claimIntake').TraceEntry[]} [existingTrace]
 * @param {{
 *   claimHistoryService?: {
 *     getAnnualUsedAmount?: Function,
 *     getFamilyFloaterUsedAmount?: Function
 *   }
 * }} [options]
 */
function adjudicateFinancialClaim(input, existingTrace = [], options = {}) {
  const trace = [...existingTrace];
  const adjustments = [];
  const claimHistoryService = options.claimHistoryService || DEFAULT_CLAIM_HISTORY;

  try {
    const policy = getPolicyFromInput(input);
    const claim = input?.claim || {};
    const documentIntelligenceResult = input?.documentIntelligenceResult || {};
    const coverageResult = input?.coverageResult || null;
    const claimType = getClaimType(claim);
    const categoryRules = getCategoryRules(policy, claimType);
    const coverageLimits = getCoverageLimits(policy);

    const billLineItems = extractHospitalBillLineItems(documentIntelligenceResult);
    const useLineItemAdjudication =
      supportsLineItemEvaluation(claimType) && billLineItems.length > 0;

    let lineItemDecisions = [];
    let base;

    if (useLineItemAdjudication) {
      lineItemDecisions = evaluateLineItems(billLineItems, claimType, policy);
      const approvedLineTotal = sumLineItemAmounts(lineItemDecisions, 'APPROVED');
      const claimedLineTotal = sumLineItemAmounts(lineItemDecisions);

      base = {
        amount: approvedLineTotal,
        source: 'LINE_ITEMS',
        claimedTotal: claimedLineTotal,
      };

      const approvedCount = lineItemDecisions.filter((item) => item.decision === 'APPROVED').length;
      const rejectedCount = lineItemDecisions.filter((item) => item.decision === 'REJECTED').length;

      trace.push(
        createTraceEntry(
          'LINE_ITEM_EVALUATION',
          rejectedCount > 0 ? 'WARNING' : 'PASS',
          `${approvedCount} approved, ${rejectedCount} rejected of ${lineItemDecisions.length} line item(s)`
        )
      );

      trace.push(
        createTraceEntry(
          'BASE_AMOUNT',
          'PASS',
          `Approved line items total ₹${approvedLineTotal} of ₹${claimedLineTotal} claimed across ${lineItemDecisions.length} line item(s)`
        )
      );
    } else {
      base = determineBaseAmount(claim, documentIntelligenceResult);

      trace.push(
        createTraceEntry(
          'BASE_AMOUNT',
          'PASS',
          `Base amount ₹${base.amount} from ${base.source}`
        )
      );
    }

    const claimedAmount = useLineItemAdjudication
      ? roundAmount(base.claimedTotal ?? base.amount)
      : base.amount;

    let runningAmount = base.amount;

    const subLimit = Number(categoryRules.sub_limit);
    if (Number.isFinite(subLimit)) {
      runningAmount = applyCap({
        runningAmount,
        limit: subLimit,
        type: 'SUB_LIMIT',
        description: `${claimType} sub-limit of ₹${subLimit} applied`,
        adjustments,
        trace,
      });
    }

    const perClaimLimit = Number(coverageLimits.per_claim_limit);
    if (Number.isFinite(perClaimLimit)) {
      runningAmount = applyCap({
        runningAmount,
        limit: perClaimLimit,
        type: 'PER_CLAIM_LIMIT',
        description: `Per-claim limit of ₹${perClaimLimit} applied`,
        adjustments,
        trace,
      });
    }

    const annualLimit = Number(coverageLimits.annual_opd_limit);
    const annualUsed = Number(
      claimHistoryService.getAnnualUsedAmount({
        claim,
        member: input?.member,
        policy,
      }) || 0
    );
    const annualBalance = Number.isFinite(annualLimit)
      ? Math.max(annualLimit - annualUsed, 0)
      : null;

    if (Number.isFinite(annualBalance)) {
      runningAmount = applyCap({
        runningAmount,
        limit: annualBalance,
        type: 'ANNUAL_LIMIT',
        description: `Annual OPD balance of ₹${annualBalance} applied (used ₹${annualUsed} of ₹${annualLimit})`,
        adjustments,
        trace,
      });
    }

    const familyFloater = coverageLimits.family_floater || {};
    if (familyFloater.enabled) {
      const familyLimit = Number(familyFloater.combined_limit);
      const familyUsed = Number(
        claimHistoryService.getFamilyFloaterUsedAmount({
          claim,
          member: input?.member,
          policy,
        }) || 0
      );
      const familyBalance = Number.isFinite(familyLimit)
        ? Math.max(familyLimit - familyUsed, 0)
        : null;

      if (Number.isFinite(familyBalance)) {
        runningAmount = applyCap({
          runningAmount,
          limit: familyBalance,
          type: 'FAMILY_FLOATER',
          description: `Family floater balance of ₹${familyBalance} applied (used ₹${familyUsed} of ₹${familyLimit})`,
          adjustments,
          trace,
        });
      }
    }

    const eligibleAmount = roundAmount(runningAmount);

    const hospitalName = getHospitalName(claim, documentIntelligenceResult);
    const networkDiscountPercent = Number(categoryRules.network_discount_percent);
    const isNetwork = isNetworkHospital(hospitalName, policy);

    if (isNetwork && Number.isFinite(networkDiscountPercent) && networkDiscountPercent > 0) {
      runningAmount = applyPercentageReduction({
        runningAmount,
        percent: networkDiscountPercent,
        type: 'NETWORK_DISCOUNT',
        description: `${networkDiscountPercent}% network discount applied for ${hospitalName}`,
        adjustments,
        trace,
      });
    } else {
      trace.push(
        createTraceEntry(
          'NETWORK_DISCOUNT',
          'PASS',
          hospitalName
            ? `No network discount applied for ${hospitalName}`
            : 'No network hospital identified — network discount skipped'
        )
      );
    }

    const copayPercent = getCopayPercent(claim, categoryRules);
    let patientCopay = 0;

    if (Number.isFinite(copayPercent) && copayPercent > 0 && runningAmount > 0) {
      patientCopay = roundAmount(runningAmount * (copayPercent / 100));
      runningAmount = roundAmount(runningAmount - patientCopay);

      adjustments.push({
        type: 'COPAY',
        description: `${copayPercent}% copay applied`,
        amountReduced: patientCopay,
      });
      trace.push(
        createTraceEntry(
          'COPAY',
          'PASS',
          `${copayPercent}% copay of ₹${patientCopay} applied`
        )
      );
    } else {
      trace.push(createTraceEntry('COPAY', 'PASS', 'No copay applied'));
    }

    let approvedAmount = roundAmount(runningAmount);

    if (coverageResult && coverageResult.eligible === false) {
      approvedAmount = 0;
      trace.push(
        createTraceEntry(
          'COPAY',
          'WARNING',
          'Coverage ineligible — approved amount set to ₹0'
        )
      );
    }

    const patientPayable = roundAmount(Math.max(claimedAmount - approvedAmount, 0));

    return {
      claimedAmount,
      eligibleAmount,
      approvedAmount,
      patientPayable,
      lineItemDecisions,
      adjustments,
      trace,
      claim,
      member: input?.member || null,
      coverageResult,
      documentIntelligenceResult,
      hospitalName,
      isNetworkHospital: isNetwork,
    };
  } catch (error) {
    const fallbackClaimed = roundAmount(getClaimedAmountFromClaim(input?.claim || {}));

    trace.push(
      createTraceEntry(
        'BASE_AMOUNT',
        'FAIL',
        error.message || 'Financial adjudication failed'
      )
    );

    return {
      claimedAmount: fallbackClaimed,
      eligibleAmount: 0,
      approvedAmount: 0,
      patientPayable: fallbackClaimed,
      lineItemDecisions: [],
      adjustments,
      trace,
      claim: input?.claim || null,
      member: input?.member || null,
      coverageResult: input?.coverageResult || null,
      documentIntelligenceResult: input?.documentIntelligenceResult || null,
      error: error.message || 'Financial adjudication failed',
    };
  }
}

module.exports = {
  adjudicateFinancialClaim,
  determineBaseAmount,
  extractHospitalBillLineItems,
  evaluateLineItems,
  evaluateDentalLineItem,
  evaluateVisionLineItem,
  getCopayPercent,
  isNetworkHospital,
  createTraceEntry,
  roundAmount,
  applyCap,
  applyPercentageReduction,
};
