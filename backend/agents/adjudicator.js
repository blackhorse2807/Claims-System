const { isNetworkHospital } = require('../policyLoader');

// Check if two strings partially match (case-insensitive, either contains the other)
function partialMatch(textA, textB) {
  if (!textA || !textB) {
    return false;
  }

  const lowerA = textA.toLowerCase();
  const lowerB = textB.toLowerCase();

  return lowerA.includes(lowerB) || lowerB.includes(lowerA);
}

// Check if diagnosis or treatment text matches any exclusion in a list
function findMatchingExclusion(diagnosis, treatment, exclusionList) {
  const combinedText = `${diagnosis || ''} ${treatment || ''}`.toLowerCase();

  for (const exclusion of exclusionList) {
    if (partialMatch(diagnosis, exclusion)) {
      return exclusion;
    }
    if (partialMatch(treatment, exclusion)) {
      return exclusion;
    }

    // Also match on significant words from the exclusion phrase (e.g. "obesity" in "Morbid Obesity")
    const exclusionWords = exclusion.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
    for (const word of exclusionWords) {
      if (combinedText.includes(word)) {
        return exclusion;
      }
    }
  }

  return null;
}

// Check if a line item description matches any item in a list (partial, case-insensitive)
function matchesListItem(description, itemList) {
  for (const item of itemList) {
    if (partialMatch(description, item)) {
      return item;
    }
  }

  return null;
}

// Round a number to 2 decimal places
function roundToTwoDecimals(amount) {
  return Math.round(amount * 100) / 100;
}

async function adjudicateClaim(claim, policy) {
  try {
    const checks = [];
    let rejectionReason = null;
    let rejectionDetail = null;
    let hardRejected = false;

    // Read all category rules and thresholds from policy — never hardcode these
    const categoryKey = claim.claim_category.toLowerCase();
    const categoryRules = policy.opd_categories[categoryKey];
    const diagnosticCategory = policy.opd_categories.diagnostic || {};
    const preAuthThreshold = diagnosticCategory.pre_auth_threshold;
    const highValueTests = diagnosticCategory.high_value_tests_requiring_pre_auth || [];
    const copayPercent = categoryRules?.copay_percent ?? 0;
    const networkDiscountPercent = categoryRules?.network_discount_percent ?? 0;
    const coveredDentalProcedures = policy.opd_categories.dental?.covered_procedures || [];
    const excludedDentalProcedures = policy.opd_categories.dental?.excluded_procedures || [];
    const coveredVisionItems = policy.opd_categories.vision?.covered_items || [];
    const excludedVisionItems = policy.opd_categories.vision?.excluded_items || [];

    const diagnosis = claim.diagnosis || '';
    const treatment = claim.treatment || '';

    // --- Rule 1: Check that the claim category is covered by the policy ---
    if (!categoryRules || categoryRules.covered === false) {
      checks.push({
        rule: 'category_covered',
        passed: false,
        detail: `Category ${claim.claim_category} is not covered under this policy`,
      });

      return {
        agent: 'adjudicator',
        passed: false,
        checks,
        approved_amount: 0,
        line_items: [],
        rejection_reason: 'NOT_COVERED',
        rejection_detail: `${claim.claim_category} claims are not covered under this policy`,
      };
    }

    checks.push({
      rule: 'category_covered',
      passed: true,
      detail: `Category ${claim.claim_category} is covered`,
    });

    // --- Rule 2: Check for excluded conditions (general + category-specific) ---
    const generalExclusions = policy.exclusions?.conditions || [];
    let matchedExclusion = findMatchingExclusion(diagnosis, treatment, generalExclusions);

    // Also check category-specific exclusion lists
    if (!matchedExclusion && claim.claim_category === 'DENTAL') {
      const dentalExclusions = [
        ...(policy.exclusions?.dental_exclusions || []),
        ...excludedDentalProcedures,
      ];
      matchedExclusion = findMatchingExclusion(diagnosis, treatment, dentalExclusions);
    }

    if (!matchedExclusion && claim.claim_category === 'VISION') {
      const visionExclusions = [
        ...(policy.exclusions?.vision_exclusions || []),
        ...excludedVisionItems,
      ];
      matchedExclusion = findMatchingExclusion(diagnosis, treatment, visionExclusions);
    }

    if (matchedExclusion) {
      checks.push({
        rule: 'excluded_condition',
        passed: false,
        detail: `Condition matches policy exclusion: "${matchedExclusion}"`,
      });

      return {
        agent: 'adjudicator',
        passed: false,
        checks,
        approved_amount: 0,
        line_items: [],
        rejection_reason: 'EXCLUDED_CONDITION',
        rejection_detail: `Claim rejected — "${matchedExclusion}" is excluded by policy`,
      };
    }

    checks.push({
      rule: 'excluded_condition',
      passed: true,
      detail: 'No excluded conditions matched',
    });

    // --- Rule 3: Pre-authorization check for high-value diagnostic tests ---
    const needsPreAuthCheck =
      claim.claim_category === 'DIAGNOSTIC' &&
      preAuthThreshold !== undefined &&
      claim.claimed_amount > preAuthThreshold;

    if (needsPreAuthCheck) {
      const combinedText = `${diagnosis} ${treatment}`.toLowerCase();
      const requiresPreAuth = highValueTests.some((testName) => {
        return combinedText.includes(testName.toLowerCase());
      });

      if (requiresPreAuth && claim.pre_auth_obtained !== true) {
        const testsLabel = highValueTests.join('/');
        checks.push({
          rule: 'pre_authorization',
          passed: false,
          detail: 'High-value diagnostic test requires pre-authorization',
        });

        return {
          agent: 'adjudicator',
          passed: false,
          checks,
          approved_amount: 0,
          line_items: [],
          rejection_reason: 'PRE_AUTH_REQUIRED',
          rejection_detail: `Pre-authorization required for ${testsLabel} when claim exceeds ₹${preAuthThreshold}`,
        };
      }
    }

    checks.push({
      rule: 'pre_authorization',
      passed: true,
      detail: 'Pre-authorization not required or already obtained',
    });

    // --- Rule 4: Process each line item (or create a single lump-sum item) ---
    let processedLineItems = [];

    if (claim.line_items && claim.line_items.length > 0) {
      for (const item of claim.line_items) {
        const lineItemResult = processLineItem(item, claim.claim_category, {
          covered_procedures: coveredDentalProcedures,
          excluded_procedures: excludedDentalProcedures,
          covered_items: coveredVisionItems,
          excluded_items: excludedVisionItems,
        });
        processedLineItems.push(lineItemResult);
      }
    } else {
      // No line items provided — treat the full claimed amount as one line
      processedLineItems.push({
        description: 'Total claim amount',
        claimed: claim.claimed_amount,
        approved: claim.claimed_amount,
        status: 'approved',
        reason: 'Full amount approved pending discount calculation',
      });
    }

    // --- Rule 5: Calculate approved amount with network discount then copay ---
    const rawApprovedTotal = processedLineItems
      .filter((item) => item.status === 'approved')
      .reduce((sum, item) => sum + item.approved, 0);

    let amountAfterDiscount = rawApprovedTotal;
    const isNetwork = isNetworkHospital(claim.hospital_name);

    // Step 5a: Apply network discount if hospital is in the network
    if (isNetwork && networkDiscountPercent > 0) {
      amountAfterDiscount = rawApprovedTotal * (1 - networkDiscountPercent / 100);
    }

    // Step 5b: Apply copay on the discounted amount
    let finalAmount = amountAfterDiscount * (1 - copayPercent / 100);
    finalAmount = roundToTwoDecimals(finalAmount);

    // Build the calculation breakdown message for the checks array
    let calculationDetail = `Claimed ₹${claim.claimed_amount}`;

    if (isNetwork && networkDiscountPercent > 0) {
      calculationDetail += ` → Network discount ${networkDiscountPercent}% → ₹${roundToTwoDecimals(amountAfterDiscount)}`;
    }

    if (copayPercent > 0) {
      calculationDetail += ` → Copay ${copayPercent}% → ₹${finalAmount} approved`;
    } else {
      calculationDetail += ` → ₹${finalAmount} approved`;
    }

    checks.push({
      rule: 'amount_calculation',
      passed: true,
      detail: calculationDetail,
    });

    // Scale individual line item approved amounts proportionally to match final amount
    if (rawApprovedTotal > 0 && finalAmount !== rawApprovedTotal) {
      const scaleFactor = finalAmount / rawApprovedTotal;

      for (const item of processedLineItems) {
        if (item.status === 'approved') {
          item.approved = roundToTwoDecimals(item.approved * scaleFactor);

          if (copayPercent > 0) {
            item.reason = `${copayPercent}% copay applied`;
          }
          if (isNetwork && networkDiscountPercent > 0) {
            item.reason = `${networkDiscountPercent}% network discount and ${copayPercent}% copay applied`;
          }
        }
      }
    }

    let approvedAmount = finalAmount;

    // Category sub_limit is an annual category budget, not a per-claim cap.
    // Per-claim limits are enforced in eligibility for applicable categories.

    // Overall pass: approved amount must be > 0 and no hard rejection occurred
    const overallPassed = approvedAmount > 0 && !hardRejected;

    return {
      agent: 'adjudicator',
      passed: overallPassed,
      checks,
      approved_amount: approvedAmount,
      line_items: processedLineItems,
      rejection_reason: overallPassed ? null : rejectionReason,
      rejection_detail: overallPassed ? null : rejectionDetail,
    };
  } catch (error) {
    console.error('[adjudicator] Error adjudicating claim:', error.message);
    throw error;
  }
}

// Process a single line item based on the claim category rules from policy
function processLineItem(item, claimCategory, procedureLists) {
  const description = item.description || '';
  const claimedAmount = item.claimed || item.amount || 0;

  // --- DENTAL: match against covered and excluded procedure lists ---
  if (claimCategory === 'DENTAL') {
    const excludedMatch = matchesListItem(description, procedureLists.excluded_procedures || []);

    if (excludedMatch) {
      return {
        description,
        claimed: claimedAmount,
        approved: 0,
        status: 'rejected',
        reason: `Cosmetic procedure excluded by policy (${excludedMatch})`,
      };
    }

    const coveredMatch = matchesListItem(description, procedureLists.covered_procedures || []);

    if (coveredMatch) {
      return {
        description,
        claimed: claimedAmount,
        approved: claimedAmount,
        status: 'approved',
        reason: `Covered procedure: ${coveredMatch}`,
      };
    }

    // Procedure not in either list — approve by default unless category excluded
    return {
      description,
      claimed: claimedAmount,
      approved: claimedAmount,
      status: 'approved',
      reason: 'Procedure approved (not in exclusion list)',
    };
  }

  // --- VISION: match against covered and excluded item lists ---
  if (claimCategory === 'VISION') {
    const excludedMatch = matchesListItem(description, procedureLists.excluded_items || []);

    if (excludedMatch) {
      return {
        description,
        claimed: claimedAmount,
        approved: 0,
        status: 'rejected',
        reason: `Excluded vision item: ${excludedMatch}`,
      };
    }

    const coveredMatch = matchesListItem(description, procedureLists.covered_items || []);

    if (coveredMatch) {
      return {
        description,
        claimed: claimedAmount,
        approved: claimedAmount,
        status: 'approved',
        reason: `Covered item: ${coveredMatch}`,
      };
    }

    return {
      description,
      claimed: claimedAmount,
      approved: claimedAmount,
      status: 'approved',
      reason: 'Vision item approved (not in exclusion list)',
    };
  }

  // --- All other categories: approve the full line item amount ---
  return {
    description,
    claimed: claimedAmount,
    approved: claimedAmount,
    status: 'approved',
    reason: 'Line item approved',
  };
}

module.exports = { adjudicateClaim };
