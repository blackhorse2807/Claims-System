import { formatDocLabel, getDocumentRequirements } from '../data/policyData';
import { evaluateDateHardStops } from './dateHardStops';

const FIELD_SECTIONS = {
  memberId: 'Member Information',
  memberName: 'Member Information',
  relationship: 'Member Information',
  treatmentDate: 'Member Information',
  claimSubmissionDate: 'Member Information',
  claimType: 'Claim Information',
  claimedAmount: 'Claim Information',
  hospitalName: 'Claim Information',
  doctorName: 'Claim Information',
  diagnosis: 'Claim Information',
  procedureName: 'Claim Information',
  isPreExisting: 'Claim Information',
  preAuthorizationObtained: 'Claim Information',
  preAuthorizationId: 'Claim Information',
  documents: 'Document Uploads',
};

function getSectionForPath(path) {
  const root = path.split('.')[0];
  return FIELD_SECTIONS[root] || 'General';
}

function flattenFormErrors(errors, path = '') {
  const results = [];

  if (!errors || typeof errors !== 'object') {
    return results;
  }

  if (typeof errors.message === 'string') {
    results.push({ path: path || 'form', message: errors.message });
    return results;
  }

  if (Array.isArray(errors)) {
    errors.forEach((item, index) => {
      const nextPath = path ? `${path}.${index}` : String(index);
      results.push(...flattenFormErrors(item, nextPath));
    });
    return results;
  }

  for (const [key, value] of Object.entries(errors)) {
    const nextPath = path ? `${path}.${key}` : key;
    results.push(...flattenFormErrors(value, nextPath));
  }

  return results;
}

export function collectSubmissionBlockers(values, formErrors = {}, members = []) {
  const blockers = [];
  const seen = new Set();

  function add(section, message) {
    const key = `${section}::${message}`;
    if (!seen.has(key)) {
      seen.add(key);
      blockers.push({ section, message });
    }
  }

  for (const { path, message } of flattenFormErrors(formErrors)) {
    add(getSectionForPath(path), message);
  }

  const { checks } = evaluateDateHardStops({
    treatmentDate: values.treatmentDate,
    claimSubmissionDate: values.claimSubmissionDate,
  });

  for (const check of checks) {
    if (!check.pending && !check.passed) {
      add('Member Information', check.message);
    }
  }

  if (!values.memberId?.trim()) {
    add('Member Information', 'Please enter the member ID.');
  }

  if (!values.treatmentDate) {
    add('Member Information', 'Please enter the date of treatment.');
  }

  if (!values.claimSubmissionDate) {
    add('Member Information', 'Please enter the date of claim submission.');
  }

  if (!values.claimType) {
    add('Claim Information', 'Please select a claim type.');
  }

  if (!values.claimedAmount || Number(values.claimedAmount) <= 0) {
    add('Claim Information', 'Please enter a claimed amount greater than ₹0.');
  }

  if (values.preAuthorizationObtained === 'yes' && !values.preAuthorizationId?.trim()) {
    add('Claim Information', 'Pre-authorization ID is required when pre-authorization was obtained.');
  }

  const documents = values.documents || [];
  if (documents.length === 0) {
    add('Document Uploads', 'Please upload at least one supporting document.');
  }

  if (values.claimType) {
    const requirements = getDocumentRequirements(values.claimType);
    const uploadedCategories = documents.map((doc) => doc?.category).filter(Boolean);

    if (requirements) {
      for (const requiredType of requirements.required) {
        if (!uploadedCategories.includes(requiredType)) {
          add(
            'Document Uploads',
            `Missing required document for ${values.claimType.replace(/_/g, ' ')}: ${formatDocLabel(requiredType)}.`
          );
        }
      }
    }
  }

  return blockers;
}

export function groupBlockersBySection(blockers) {
  const grouped = new Map();

  for (const blocker of blockers) {
    if (!grouped.has(blocker.section)) {
      grouped.set(blocker.section, []);
    }
    grouped.get(blocker.section).push(blocker.message);
  }

  return Array.from(grouped.entries()).map(([section, messages]) => ({
    section,
    messages,
  }));
}
