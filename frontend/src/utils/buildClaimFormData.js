export function buildClaimFormData(applicant, details) {
  switch (details.claimType) {
    case 'CONSULTATION':
      return buildConsultationFormData(applicant, details);
    case 'DIAGNOSTIC':
      return buildDiagnosticFormData(applicant, details);
    case 'PHARMACY':
      return buildPharmacyFormData(applicant, details);
    case 'DENTAL':
      return buildDentalFormData(applicant, details);
    case 'VISION':
      return buildVisionFormData(applicant, details);
    case 'ALTERNATIVE_MEDICINE':
      return buildAlternativeMedicineFormData(applicant, details);
    default:
      return null;
  }
}

function appendApplicantFields(formData, applicant) {
  formData.append('memberId', applicant.memberId);
  formData.append('memberName', applicant.memberName);
  formData.append('dob', applicant.dob);
  formData.append('gender', applicant.gender);
  formData.append('relationship', applicant.relationship);
  if (applicant.primaryMemberId) {
    formData.append('primaryMemberId', applicant.primaryMemberId);
  }
  formData.append('treatmentDate', applicant.treatmentDate);
  formData.append('claimSubmissionDate', applicant.claimSubmissionDate);
}

function buildConsultationFormData(applicant, details) {
  const formData = new FormData();
  appendApplicantFields(formData, applicant);
  formData.append('claimType', details.claimType);
  formData.append('claimedAmount', String(details.consultationAmount));
  formData.append('policy_id', 'PLUM_GHI_2024');
  formData.append('ytd_claims_amount', '0');
  formData.append('claims_history', '[]');
  formData.append('hospitalName', details.hospitalName);
  formData.append('isPreExisting', 'no');
  formData.append('preAuthorizationObtained', 'no');
  if (details.consultationType) {
    formData.append('procedureName', details.consultationType);
  }
  details.documents.forEach((doc, index) => {
    formData.append('files', doc.file);
    formData.append(`doc_type_${index}`, doc.category);
  });
  return formData;
}

function buildDiagnosticFormData(applicant, details) {
  const formData = new FormData();
  appendApplicantFields(formData, applicant);
  formData.append('claimType', details.claimType);
  formData.append('claimedAmount', String(details.diagnosticAmount));
  formData.append('policy_id', 'PLUM_GHI_2024');
  formData.append('ytd_claims_amount', '0');
  formData.append('claims_history', '[]');
  formData.append('hospitalName', details.hospitalName);
  formData.append('procedureName', details.diagnosticTestType);
  formData.append('isPreExisting', 'no');
  formData.append(
    'preAuthorizationObtained',
    details.preAuthorizationObtained ? 'yes' : 'no'
  );
  if (details.preAuthorizationId) {
    formData.append('preAuthorizationId', details.preAuthorizationId);
  }
  details.documents.forEach((doc, index) => {
    formData.append('files', doc.file);
    formData.append(`doc_type_${index}`, doc.category);
  });
  return formData;
}

function buildPharmacyFormData(applicant, details) {
  const formData = new FormData();
  appendApplicantFields(formData, applicant);
  formData.append('claimType', details.claimType);
  formData.append('claimedAmount', String(details.medicineAmount));
  formData.append('policy_id', 'PLUM_GHI_2024');
  formData.append('ytd_claims_amount', '0');
  formData.append('claims_history', '[]');
  formData.append('hospitalName', details.pharmacyName);
  formData.append('isPreExisting', 'no');
  formData.append('preAuthorizationObtained', 'no');
  if (details.medicineType) {
    formData.append('procedureName', details.medicineType);
  }
  details.documents.forEach((doc, index) => {
    formData.append('files', doc.file);
    formData.append(`doc_type_${index}`, doc.category);
  });
  return formData;
}

function buildDentalFormData(applicant, details) {
  const formData = new FormData();
  appendApplicantFields(formData, applicant);
  formData.append('claimType', details.claimType);
  formData.append('claimedAmount', String(details.treatmentAmount));
  formData.append('policy_id', 'PLUM_GHI_2024');
  formData.append('ytd_claims_amount', '0');
  formData.append('claims_history', '[]');
  formData.append('hospitalName', details.clinicName);
  formData.append('procedureName', details.procedureType);
  formData.append('isPreExisting', 'no');
  formData.append('preAuthorizationObtained', 'no');
  details.documents.forEach((doc, index) => {
    formData.append('files', doc.file);
    formData.append(`doc_type_${index}`, doc.category);
  });
  return formData;
}

function buildVisionFormData(applicant, details) {
  const formData = new FormData();
  appendApplicantFields(formData, applicant);
  formData.append('claimType', details.claimType);
  formData.append('claimedAmount', String(details.treatmentAmount));
  formData.append('policy_id', 'PLUM_GHI_2024');
  formData.append('ytd_claims_amount', '0');
  formData.append('claims_history', '[]');
  formData.append('hospitalName', details.clinicName);
  formData.append('procedureName', details.treatmentType);
  formData.append('isPreExisting', 'no');
  formData.append('preAuthorizationObtained', 'no');
  details.documents.forEach((doc, index) => {
    formData.append('files', doc.file);
    formData.append(`doc_type_${index}`, doc.category);
  });
  return formData;
}

function buildAlternativeMedicineFormData(applicant, details) {
  const formData = new FormData();
  appendApplicantFields(formData, applicant);
  formData.append('claimType', details.claimType);
  formData.append('claimedAmount', String(details.treatmentAmount));
  formData.append('policy_id', 'PLUM_GHI_2024');
  formData.append('ytd_claims_amount', '0');
  formData.append('claims_history', '[]');
  formData.append('hospitalName', details.clinicName);
  formData.append('procedureName', details.medicineSystem);
  formData.append('doctorName', details.practitionerName);
  formData.append('isPreExisting', 'no');
  formData.append('preAuthorizationObtained', 'no');
  details.documents.forEach((doc, index) => {
    formData.append('files', doc.file);
    formData.append(`doc_type_${index}`, doc.category);
  });
  return formData;
}
