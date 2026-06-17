import { POLICY_PERIOD, SUBMISSION_DEADLINE_DAYS } from '../data/policyData';

export function todayIsoDate() {
  return new Date().toISOString().split('T')[0];
}

function parseIsoDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function daysBetween(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return null;
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

export function evaluateDateHardStops({ treatmentDate, claimSubmissionDate }) {
  const treatment = parseIsoDate(treatmentDate);
  const submission = parseIsoDate(claimSubmissionDate);
  const policyStart = parseIsoDate(POLICY_PERIOD.start);
  const policyEnd = parseIsoDate(POLICY_PERIOD.end);

  const hasTreatment = Boolean(treatment);
  const hasSubmission = Boolean(submission);

  const submissionAfterTreatment =
    !hasTreatment || !hasSubmission || submission >= treatment;

  const treatmentInPolicyPeriod =
    !hasTreatment ||
    (policyStart &&
      policyEnd &&
      treatment >= policyStart &&
      treatment <= policyEnd);

  const elapsedDays =
    hasTreatment && hasSubmission ? daysBetween(treatmentDate, claimSubmissionDate) : null;

  const withinSubmissionDeadline =
    elapsedDays === null || (elapsedDays >= 0 && elapsedDays <= SUBMISSION_DEADLINE_DAYS);

  const checks = [
    {
      id: 'submission_after_treatment',
      label: 'Submission date is on or after treatment date',
      passed: submissionAfterTreatment,
      pending: !hasTreatment || !hasSubmission,
      field: 'claimSubmissionDate',
      message: 'Claim submission date cannot be before the treatment date.',
    },
    {
      id: 'treatment_in_policy_period',
      label: 'Treatment date falls within the active policy period',
      passed: treatmentInPolicyPeriod,
      pending: !hasTreatment,
      field: 'treatmentDate',
      message: `Treatment date must be between ${POLICY_PERIOD.start} and ${POLICY_PERIOD.end}.`,
    },
    {
      id: 'submission_deadline',
      label: `Claim submitted within ${SUBMISSION_DEADLINE_DAYS} days of treatment`,
      passed: withinSubmissionDeadline,
      pending: !hasTreatment || !hasSubmission,
      field: 'claimSubmissionDate',
      message:
        elapsedDays !== null && elapsedDays < 0
          ? 'Claim submission date cannot be before the treatment date.'
          : `Claim must be submitted within ${SUBMISSION_DEADLINE_DAYS} days of the treatment date.`,
    },
  ];

  const activeChecks = checks.filter((check) => !check.pending);
  const allPassed = activeChecks.length > 0 && activeChecks.every((check) => check.passed);

  return { checks, allPassed };
}
