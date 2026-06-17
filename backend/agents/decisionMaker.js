async function makeDecision(
  claim,
  eligibilityResult,
  adjudicationResult,
  fraudResult,
  componentFailures = [],
  policy = null
) {
  try {
    const claimId = crypto.randomUUID();
    const claimedAmount = claim.claimed_amount;

    // Read submission rules from policy when available
    const submissionRules = policy?.submission_rules || {};
    const minimumClaimAmount = submissionRules.minimum_claim_amount;
    const submissionDeadlineDays = submissionRules.deadline_days_from_treatment;

    let decision = 'APPROVED';
    let approvedAmount = 0;
    // Internal scoring weights — not policy values
    let confidenceScore = 0.92;
    const reasons = [];
    const rejectionReasons = [];
    let recommendation = null;

    // --- Step 0: Reject if claim is below the policy minimum amount ---
    if (minimumClaimAmount !== undefined && claimedAmount < minimumClaimAmount) {
      return {
        claim_id: claimId,
        decision: 'REJECTED',
        approved_amount: 0,
        claimed_amount: claimedAmount,
        confidence_score: 0.95,
        reasons: [`Claimed ₹${claimedAmount} is below minimum claim amount of ₹${minimumClaimAmount}`],
        rejection_reasons: ['BELOW_MINIMUM_CLAIM'],
        line_items: [],
        trace: [eligibilityResult, adjudicationResult, fraudResult],
        component_failures: componentFailures,
        recommendation: null,
      };
    }

    // Reject if claim was submitted after the policy deadline (requires claim.submission_date)
    if (
      claim.submission_date &&
      submissionDeadlineDays !== undefined &&
      claim.treatment_date
    ) {
      const treatmentDate = new Date(`${claim.treatment_date}T00:00:00`);
      const submissionDate = new Date(`${claim.submission_date}T00:00:00`);
      const deadlineDate = new Date(treatmentDate);
      deadlineDate.setDate(deadlineDate.getDate() + submissionDeadlineDays);

      if (submissionDate > deadlineDate) {
        return {
          claim_id: claimId,
          decision: 'REJECTED',
          approved_amount: 0,
          claimed_amount: claimedAmount,
          confidence_score: 0.95,
          reasons: [
            `Claim submitted after ${submissionDeadlineDays}-day deadline from treatment date`,
          ],
          rejection_reasons: ['SUBMISSION_DEADLINE_EXCEEDED'],
          line_items: [],
          trace: [eligibilityResult, adjudicationResult, fraudResult],
          component_failures: componentFailures,
          recommendation: null,
        };
      }
    }

    // --- Step 1: Reject if eligibility checks failed ---
    if (eligibilityResult.passed === false) {
      decision = 'REJECTED';
      confidenceScore = 0.95; // internal scoring weight for clear rejection

      if (eligibilityResult.rejection_reason) {
        rejectionReasons.push(eligibilityResult.rejection_reason);
      }

      if (eligibilityResult.rejection_detail) {
        reasons.push(eligibilityResult.rejection_detail);
      }
    }
    // --- Step 2: Reject if adjudication failed (only if not already rejected) ---
    else if (adjudicationResult.passed === false) {
      decision = 'REJECTED';
      confidenceScore = 0.95; // internal scoring weight for clear rejection

      if (adjudicationResult.rejection_reason) {
        rejectionReasons.push(adjudicationResult.rejection_reason);
      }

      if (adjudicationResult.rejection_detail) {
        reasons.push(adjudicationResult.rejection_detail);
      }
    }
    // --- Step 3: Route to manual review if fraud flags were raised ---
    else if (fraudResult.requires_manual_review === true) {
      decision = 'MANUAL_REVIEW';
      confidenceScore = 0.7; // internal scoring weight for manual review routing
      approvedAmount = adjudicationResult.approved_amount;

      const flagDescriptions = fraudResult.flags.map(
        (flag) => `${flag.flag}: ${flag.detail}`
      );
      recommendation = `Manual review required: ${flagDescriptions.join('; ')}`;
    }
    // --- Step 4: Partial approval if some line items approved and some rejected ---
    else {
      const lineItems = adjudicationResult.line_items || [];
      const hasApprovedItems = lineItems.some(
        (item) => item.status === 'approved' && item.approved > 0
      );
      const hasRejectedItems = lineItems.some(
        (item) => item.status === 'rejected' || item.approved === 0
      );

      if (hasApprovedItems && hasRejectedItems) {
        decision = 'PARTIAL';
        approvedAmount = adjudicationResult.approved_amount;
        confidenceScore = 0.9; // internal scoring weight for partial approval
      }
      // --- Step 5: Full approval ---
      else {
        decision = 'APPROVED';
        approvedAmount = adjudicationResult.approved_amount;
        confidenceScore = 0.92; // internal scoring weight for full approval
      }
    }

    // Collect approval reasons from adjudication line items and checks
    if (decision === 'APPROVED' || decision === 'PARTIAL') {
      approvedAmount = adjudicationResult.approved_amount;

      const lineItems = adjudicationResult.line_items || [];
      for (const item of lineItems) {
        if (item.reason && item.status === 'approved') {
          reasons.push(item.reason);
        }
      }

      const adjudicationChecks = adjudicationResult.checks || [];
      for (const check of adjudicationChecks) {
        if (check.detail && check.detail.includes('→')) {
          reasons.push(check.detail);
        }
      }
    }

    // --- Reduce confidence for any agent that failed to run (timeouts, errors) ---
    const failures = componentFailures || [];

    if (failures.length > 0) {
      confidenceScore -= failures.length * 0.15; // internal scoring penalty per failed component

      if (confidenceScore < 0) {
        confidenceScore = 0;
      }

      if (!recommendation) {
        recommendation = 'Manual review recommended due to incomplete processing';
      } else if (!recommendation.includes('incomplete processing')) {
        recommendation += '. Manual review recommended due to incomplete processing';
      }
    }

    return {
      claim_id: claimId,
      decision,
      approved_amount: approvedAmount,
      claimed_amount: claimedAmount,
      confidence_score: Math.round(confidenceScore * 100) / 100,
      reasons,
      rejection_reasons: rejectionReasons,
      line_items: adjudicationResult.line_items || [],
      trace: [eligibilityResult, adjudicationResult, fraudResult],
      component_failures: failures,
      recommendation,
    };
  } catch (error) {
    console.error('[decisionMaker] Error making decision:', error.message);
    throw error;
  }
}

module.exports = { makeDecision };
