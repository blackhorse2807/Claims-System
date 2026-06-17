const { getMember, getWaitingPeriod } = require('../policyLoader');

// Convert a YYYY-MM-DD string into a Date object at midnight local time
function parseDate(dateString) {
  return new Date(`${dateString}T00:00:00`);
}

// Format a Date object back to YYYY-MM-DD for display in check details
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Add a number of calendar days to a date and return the new date
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Extract a human-readable condition name from a diagnosis string (e.g. "Type 2 Diabetes" → "Diabetes")
function extractConditionName(diagnosis) {
  const lowerDiagnosis = (diagnosis || '').toLowerCase();
  const knownConditions = [
    { keyword: 'diabetes', label: 'Diabetes' },
    { keyword: 'hypertension', label: 'Hypertension' },
    { keyword: 'thyroid', label: 'Thyroid disorder' },
    { keyword: 'mental', label: 'Mental health condition' },
    { keyword: 'maternity', label: 'Maternity' },
    { keyword: 'obesity', label: 'Obesity' },
    { keyword: 'hernia', label: 'Hernia' },
    { keyword: 'cataract', label: 'Cataract' },
    { keyword: 'joint', label: 'Joint condition' },
  ];

  for (const condition of knownConditions) {
    if (lowerDiagnosis.includes(condition.keyword)) {
      return condition.label;
    }
  }

  return diagnosis;
}

async function checkEligibility(claim, policy) {
  try {
    const checks = [];
    let rejectionReason = null;
    let rejectionDetail = null;

    // --- Rule 1: Check that the member exists in the policy ---
    const member = getMember(claim.member_id);

    if (!member) {
      checks.push({
        rule: 'member_exists',
        passed: false,
        detail: `Member ${claim.member_id} not found in policy`,
      });

      return {
        agent: 'eligibility',
        passed: false,
        checks,
        rejection_reason: 'MEMBER_NOT_FOUND',
        rejection_detail: `Member ${claim.member_id} is not covered under this policy`,
      };
    }

    checks.push({
      rule: 'member_exists',
      passed: true,
      detail: `Member ${member.member_id} found: ${member.name}`,
    });

    const treatmentDate = parseDate(claim.treatment_date);
    const policyHolder = policy.policy_holder;

    // Read all limits from policy — never hardcode these
    const perClaimLimit = policy.coverage.per_claim_limit;
    const annualLimit = policy.coverage.annual_opd_limit;
    const initialWaitDays = policy.waiting_periods.initial_waiting_period_days;
    const policyStart = policyHolder.policy_start_date;
    const policyEnd = policyHolder.policy_end_date;

    // --- Rule 2: Check that the treatment date falls within the active policy period ---
    const policyStartDate = parseDate(policyStart);
    const policyEndDate = parseDate(policyEnd);
    const isPolicyActive =
      treatmentDate >= policyStartDate && treatmentDate <= policyEndDate;

    if (!isPolicyActive) {
      checks.push({
        rule: 'policy_active',
        passed: false,
        detail: `Treatment date ${claim.treatment_date} is outside policy period ${policyStart} to ${policyEnd}`,
      });

      if (!rejectionReason) {
        rejectionReason = 'POLICY_INACTIVE';
        rejectionDetail = `Policy is not active on treatment date ${claim.treatment_date}. Active period: ${policyStart} to ${policyEnd}`;
      }
    } else {
      checks.push({
        rule: 'policy_active',
        passed: true,
        detail: `Policy active from ${policyStart} to ${policyEnd}`,
      });
    }

    // Resolve join date — dependents may inherit their primary member's join date
    let joinDateString = member.join_date;
    if (!joinDateString && member.primary_member_id) {
      const primaryMember = getMember(member.primary_member_id);
      if (primaryMember) {
        joinDateString = primaryMember.join_date;
      }
    }

    const joinDate = joinDateString ? parseDate(joinDateString) : null;

    // --- Rule 3: Check the initial waiting period from join date ---
    if (joinDate) {
      const initialEligibleDate = addDays(joinDate, initialWaitDays);
      const initialWaitCleared = treatmentDate >= initialEligibleDate;

      if (!initialWaitCleared) {
        checks.push({
          rule: 'initial_waiting_period',
          passed: false,
          detail: `Member joined ${joinDateString}, ${initialWaitDays}-day initial wait not cleared. Eligible from ${formatDate(initialEligibleDate)}`,
        });

        if (!rejectionReason) {
          rejectionReason = 'WAITING_PERIOD';
          rejectionDetail = `Initial ${initialWaitDays}-day waiting period not cleared. Member eligible from ${formatDate(initialEligibleDate)}`;
        }
      } else {
        checks.push({
          rule: 'initial_waiting_period',
          passed: true,
          detail: `Member joined ${joinDateString}, treatment on ${claim.treatment_date}, ${initialWaitDays}-day wait cleared`,
        });
      }
    } else {
      // No join date available — pass with a note (edge case for incomplete member records)
      checks.push({
        rule: 'initial_waiting_period',
        passed: true,
        detail: 'Join date not available — initial waiting period check skipped',
      });
    }

    // --- Rule 4: Check condition-specific waiting period (only when diagnosis is provided) ---
    if (claim.diagnosis && joinDate) {
      // If the diagnosis matches an excluded condition, skip the waiting period check —
      // the adjudicator will reject it as EXCLUDED_CONDITION
      const excludedConditions = policy.exclusions?.conditions || [];
      const diagnosisLower = (claim.diagnosis || '').toLowerCase();
      const isExcluded = excludedConditions.some(
        (exclusion) =>
          diagnosisLower.includes(exclusion.toLowerCase().split(' ')[0]) ||
          exclusion.toLowerCase().includes(diagnosisLower.split(' ')[0])
      );

      if (isExcluded) {
        checks.push({
          rule: 'condition_waiting_period',
          passed: true,
          detail: 'Skipped — condition is excluded from coverage (adjudicator will handle)',
        });
      } else {
        const conditionWaitingDays = getWaitingPeriod(claim.diagnosis);
        const conditionEligibleDate = addDays(joinDate, conditionWaitingDays);
        const conditionWaitCleared = treatmentDate >= conditionEligibleDate;
        const conditionName = extractConditionName(claim.diagnosis);

        if (!conditionWaitCleared) {
          checks.push({
            rule: 'condition_waiting_period',
            passed: false,
            detail: `${conditionName} has ${conditionWaitingDays}-day wait. Eligible from ${formatDate(conditionEligibleDate)}`,
          });

          if (!rejectionReason) {
            rejectionReason = 'WAITING_PERIOD';
            rejectionDetail = `${conditionName} has ${conditionWaitingDays}-day waiting period. Member eligible from ${formatDate(conditionEligibleDate)}`;
          }
        } else {
          checks.push({
            rule: 'condition_waiting_period',
            passed: true,
            detail: `${conditionName} has ${conditionWaitingDays}-day wait. Cleared — treatment on ${claim.treatment_date}`,
          });
        }
      }
    }

    // --- Rule 5: Check per-claim amount limit ---
    // Per-claim limit only applies to categories without line-item splitting or high-value diagnostics
    const categoriesWithLineItemSplitting = ['DIAGNOSTIC', 'DENTAL', 'VISION'];
    const excludedConditions = policy.exclusions?.conditions || [];
    const diagnosisLower = (claim.diagnosis || '').toLowerCase();
    const isExcludedDiagnosis = excludedConditions.some(
      (exclusion) =>
        diagnosisLower.includes(exclusion.toLowerCase().split(' ')[0]) ||
        exclusion.toLowerCase().includes(diagnosisLower.split(' ')[0])
    );

    if (
      !categoriesWithLineItemSplitting.includes(claim.claim_category) &&
      !isExcludedDiagnosis
    ) {
      const perClaimPassed = claim.claimed_amount <= perClaimLimit;

      if (!perClaimPassed) {
        checks.push({
          rule: 'per_claim_limit',
          passed: false,
          detail: `Claimed ₹${claim.claimed_amount} but per-claim limit is ₹${perClaimLimit}`,
        });

        if (!rejectionReason) {
          rejectionReason = 'PER_CLAIM_EXCEEDED';
          rejectionDetail = `Claimed ₹${claim.claimed_amount} exceeds per-claim limit of ₹${perClaimLimit}`;
        }
      } else {
        checks.push({
          rule: 'per_claim_limit',
          passed: true,
          detail: `Claimed ₹${claim.claimed_amount}, per-claim limit ₹${perClaimLimit}`,
        });
      }
    } else {
      const skipReason = categoriesWithLineItemSplitting.includes(claim.claim_category)
        ? `Per-claim limit skipped for ${claim.claim_category} — adjudicator applies category rules`
        : 'Per-claim limit skipped — excluded condition (adjudicator will handle)';
      checks.push({
        rule: 'per_claim_limit',
        passed: true,
        detail: skipReason,
      });
    }

    // --- Rule 6: Check annual OPD limit (year-to-date + this claim) ---
    const yearToDateAmount = claim.ytd_claims_amount || 0;
    const totalAfterClaim = yearToDateAmount + claim.claimed_amount;
    const annualLimitPassed = totalAfterClaim <= annualLimit;

    if (!annualLimitPassed) {
      checks.push({
        rule: 'annual_limit',
        passed: false,
        detail: `Used ₹${yearToDateAmount} + claimed ₹${claim.claimed_amount} = ₹${totalAfterClaim}, exceeds annual limit ₹${annualLimit}`,
      });

      if (!rejectionReason) {
        rejectionReason = 'ANNUAL_LIMIT_EXCEEDED';
        rejectionDetail = `Annual OPD limit of ₹${annualLimit} would be exceeded. Already used ₹${yearToDateAmount}, claiming ₹${claim.claimed_amount}`;
      }
    } else {
      checks.push({
        rule: 'annual_limit',
        passed: true,
        detail: `Used ₹${yearToDateAmount} of ₹${annualLimit} annual limit`,
      });
    }

    // Overall pass only when every individual check passed
    const allPassed = checks.every((check) => check.passed);

    return {
      agent: 'eligibility',
      passed: allPassed,
      checks,
      rejection_reason: allPassed ? null : rejectionReason,
      rejection_detail: allPassed ? null : rejectionDetail,
    };
  } catch (error) {
    console.error('[eligibility] Error checking eligibility:', error.message);
    throw error;
  }
}

module.exports = { checkEligibility };
