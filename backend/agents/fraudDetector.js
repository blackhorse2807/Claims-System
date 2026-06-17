// Extract YYYY-MM from a date string for monthly comparison
function getMonthYear(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

async function detectFraud(claim, policy) {
  try {
    const checks = [];
    const flags = [];
    let requiresManualReview = false;

    // Read fraud thresholds from policy — never hardcode these
    const thresholds = policy.fraud_thresholds;
    const sameDayLimit = thresholds.same_day_claims_limit;
    const monthlyLimit = thresholds.monthly_claims_limit;
    const highValueThreshold = thresholds.high_value_claim_threshold;
    const claimsHistory = claim.claims_history || [];

    // --- Check 1: Same-day claims — too many claims on the treatment date ---
    const sameDayCount = claimsHistory.filter(
      (previousClaim) => previousClaim.date === claim.treatment_date
    ).length;

    const sameDayExceeded = sameDayCount >= sameDayLimit;

    checks.push({
      rule: 'same_day_claims',
      passed: !sameDayExceeded,
      detail: sameDayExceeded
        ? `${sameDayCount} claims on ${claim.treatment_date}, limit is ${sameDayLimit}`
        : `${sameDayCount} claims on ${claim.treatment_date}, within limit of ${sameDayLimit}`,
    });

    if (sameDayExceeded) {
      flags.push({
        flag: 'SAME_DAY_CLAIMS',
        detail: `${sameDayCount} claims on ${claim.treatment_date}, limit is ${sameDayLimit}`,
        severity: 'HIGH',
      });
      requiresManualReview = true;
    }

    // --- Check 2: Monthly claims — too many claims in the same calendar month ---
    const treatmentMonthYear = getMonthYear(claim.treatment_date);

    const monthlyCount = claimsHistory.filter((previousClaim) => {
      return getMonthYear(previousClaim.date) === treatmentMonthYear;
    }).length;

    const monthlyExceeded = monthlyCount >= monthlyLimit;

    checks.push({
      rule: 'monthly_claims',
      passed: !monthlyExceeded,
      detail: monthlyExceeded
        ? `${monthlyCount} claims in ${treatmentMonthYear}, limit is ${monthlyLimit}`
        : `${monthlyCount} claims in ${treatmentMonthYear}, within limit of ${monthlyLimit}`,
    });

    if (monthlyExceeded) {
      flags.push({
        flag: 'MONTHLY_LIMIT',
        detail: `${monthlyCount} claims in ${treatmentMonthYear}, limit is ${monthlyLimit}`,
        severity: 'MEDIUM',
      });
      requiresManualReview = true;
    }

    // --- Check 3: High-value claim — amount exceeds the fraud threshold ---
    const isHighValue = claim.claimed_amount > highValueThreshold;

    checks.push({
      rule: 'high_value_claim',
      passed: !isHighValue,
      detail: isHighValue
        ? `Claimed ₹${claim.claimed_amount} exceeds threshold of ₹${highValueThreshold}`
        : `Claimed ₹${claim.claimed_amount}, within threshold of ₹${highValueThreshold}`,
    });

    if (isHighValue) {
      flags.push({
        flag: 'HIGH_VALUE_CLAIM',
        detail: `Claimed ₹${claim.claimed_amount} exceeds threshold of ₹${highValueThreshold}`,
        severity: 'MEDIUM',
      });
      requiresManualReview = true;
    }

    // --- Calculate fraud score — internal scoring weights, not policy values ---
    let fraudScore = 0.0;

    for (const flag of flags) {
      if (flag.flag === 'SAME_DAY_CLAIMS') {
        fraudScore += 0.4; // internal scoring weight
      } else if (flag.flag === 'MONTHLY_LIMIT') {
        fraudScore += 0.25; // internal scoring weight
      } else if (flag.flag === 'HIGH_VALUE_CLAIM') {
        fraudScore += 0.2; // internal scoring weight
      }
    }

    // Cap the score at 1.0 — internal scoring limit, not a policy value
    if (fraudScore > 1.0) {
      fraudScore = 1.0;
    }

    // Fraud detection never blocks a claim — it only flags for manual review
    return {
      agent: 'fraudDetector',
      passed: true,
      fraud_score: fraudScore,
      flags,
      requires_manual_review: requiresManualReview,
      checks,
    };
  } catch (error) {
    console.error('[fraudDetector] Error detecting fraud:', error.message);
    throw error;
  }
}

module.exports = { detectFraud };
