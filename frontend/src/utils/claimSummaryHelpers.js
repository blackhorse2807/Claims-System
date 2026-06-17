import { formatInr } from '../components/wizard/claim-types/shared/claimFormStyles';
import { formatFileSize } from './documentUpload';

const CLAIM_TYPE_LABELS = {
  CONSULTATION: 'Consultation',
  DIAGNOSTIC: 'Diagnostic',
  PHARMACY: 'Pharmacy',
  DENTAL: 'Dental',
  VISION: 'Vision',
  ALTERNATIVE_MEDICINE: 'Alternative Medicine',
};

const CLAIM_TYPE_ICONS = {
  CONSULTATION: '🩺',
  DIAGNOSTIC: '🔬',
  PHARMACY: '💊',
  DENTAL: '🦷',
  VISION: '👓',
  ALTERNATIVE_MEDICINE: '🌿',
};

function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRelationship(value) {
  if (!value) return '—';
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function row(label, value) {
  return { label, value: value ?? '—' };
}

function getClaimAmount(details) {
  switch (details.claimType) {
    case 'CONSULTATION':
      return details.consultationAmount;
    case 'DIAGNOSTIC':
      return details.diagnosticAmount;
    case 'PHARMACY':
      return details.medicineAmount;
    case 'DENTAL':
    case 'VISION':
    case 'ALTERNATIVE_MEDICINE':
      return details.treatmentAmount;
    default:
      return null;
  }
}

function getClaimSpecificRows(details) {
  switch (details.claimType) {
    case 'CONSULTATION':
      return [
        row('Hospital / Clinic', details.hospitalName),
        row('Consultation Amount', formatInr(details.consultationAmount)),
        row('Consultation Type', details.consultationType || 'Not specified'),
      ];
    case 'DIAGNOSTIC':
      return [
        row('Hospital / Diagnostic Center', details.hospitalName),
        row('Diagnostic Amount', formatInr(details.diagnosticAmount)),
        row('Test Type', details.diagnosticTestType),
        ...(details.preAuthorizationObtained
          ? [row('Pre-Authorization ID', details.preAuthorizationId)]
          : []),
      ];
    case 'PHARMACY':
      return [
        row('Pharmacy / Store', details.pharmacyName),
        row('Medicine Amount', formatInr(details.medicineAmount)),
        row('Medicine Type', details.medicineType || 'Not specified'),
      ];
    case 'DENTAL':
      return [
        row('Dental Clinic / Hospital', details.clinicName),
        row('Treatment Amount', formatInr(details.treatmentAmount)),
        row('Procedure Type', details.procedureType),
      ];
    case 'VISION':
      return [
        row('Hospital / Eye Clinic', details.clinicName),
        row('Treatment Amount', formatInr(details.treatmentAmount)),
        row('Vision Treatment', details.treatmentType),
      ];
    case 'ALTERNATIVE_MEDICINE':
      return [
        row('Clinic / Treatment Center', details.clinicName),
        row('Treatment Amount', formatInr(details.treatmentAmount)),
        row('Medicine System', details.medicineSystem),
        row('Practitioner', details.practitionerName),
      ];
    default:
      return [];
  }
}

export function getClaimSummaryMeta(claimType) {
  return {
    label: CLAIM_TYPE_LABELS[claimType] || claimType,
    icon: CLAIM_TYPE_ICONS[claimType] || '📋',
  };
}

export function buildClaimSummary(applicantData, claimDetails) {
  const meta = getClaimSummaryMeta(claimDetails.claimType);

  return {
    meta,
    applicant: [
      row('Member Name', applicantData.memberName || applicantData.memberId),
      row('Member ID', applicantData.memberId),
      row('Date of Birth', formatDate(applicantData.dob)),
      row('Gender', applicantData.gender),
      row('Relationship', formatRelationship(applicantData.relationship)),
      ...(applicantData.relationship !== 'SELF' && applicantData.primaryMemberId
        ? [row('Primary Member ID', applicantData.primaryMemberId)]
        : []),
      row('Treatment Date', formatDate(applicantData.treatmentDate)),
      row('Submission Date', formatDate(applicantData.claimSubmissionDate)),
    ],
    claim: [
      row('Claim Type', meta.label),
      ...getClaimSpecificRows(claimDetails),
      row('Total Claimed Amount', formatInr(getClaimAmount(claimDetails))),
    ],
    documents: (claimDetails.documents || []).map((doc) => ({
      label: doc.fileName || doc.category,
      category: doc.category.replace(/_/g, ' '),
      size: doc.fileSize ? formatFileSize(doc.fileSize) : '—',
    })),
  };
}
