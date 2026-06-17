import { evaluateDateHardStops } from './dateHardStops';

export function collectApplicantBlockers(values) {
  const blockers = [];
  const seen = new Set();

  function add(message) {
    if (!seen.has(message)) {
      seen.add(message);
      blockers.push({ section: 'Applicant Details', message });
    }
  }

  if (!values.memberId?.trim()) {
    add('Please enter the member ID.');
  }

  if (!values.memberName?.trim()) {
    add('Please enter the member name.');
  }

  if (!values.dob) {
    add('Please enter the date of birth.');
  }

  if (!values.gender) {
    add('Please select gender.');
  }

  if (values.relationship && values.relationship !== 'SELF' && !values.primaryMemberId?.trim()) {
    add('Please enter the primary member ID for dependent claims.');
  }

  if (!values.treatmentDate) {
    add('Please enter the date of treatment.');
  }

  if (!values.claimSubmissionDate) {
    add('Please enter the date of claim submission.');
  }

  const { checks } = evaluateDateHardStops({
    treatmentDate: values.treatmentDate,
    claimSubmissionDate: values.claimSubmissionDate,
  });

  for (const check of checks) {
    if (!check.pending && !check.passed) {
      add(check.message);
    }
  }

  return blockers;
}
