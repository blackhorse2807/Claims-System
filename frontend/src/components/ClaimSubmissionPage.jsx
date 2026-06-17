import { useState } from 'react';
import SubmissionBlockedDialog from './SubmissionBlockedDialog';
import WizardProgress from './wizard/WizardProgress';
import ApplicantStep from './wizard/ApplicantStep';
import ClaimTypeStep from './wizard/ClaimTypeStep';
import ClaimTypeFormPage from './wizard/ClaimTypeFormPage';
import ClaimSummaryStep from './wizard/ClaimSummaryStep';
import { collectApplicantBlockers } from '../utils/collectApplicantBlockers';
import { buildClaimFormData } from '../utils/buildClaimFormData';
import { CLAIM_TYPES, todayIsoDate } from '../schemas/claimSchema';

export default function ClaimSubmissionPage({ onSubmit, isSubmitting = false }) {
  const [wizardStep, setWizardStep] = useState('applicant');
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [submissionBlockers, setSubmissionBlockers] = useState([]);
  const [dialogTitle, setDialogTitle] = useState('Unable to Continue');
  const [dialogSubtitle, setDialogSubtitle] = useState(
    'Please fix the following issues before proceeding.'
  );
  const [selectedClaimType, setSelectedClaimType] = useState('');
  const [claimDetails, setClaimDetails] = useState(null);

  const [applicantData, setApplicantData] = useState({
    memberId: '',
    memberName: '',
    dob: '',
    gender: '',
    relationship: 'SELF',
    primaryMemberId: '',
    treatmentDate: todayIsoDate(),
    claimSubmissionDate: todayIsoDate(),
    claimType: '',
  });

  function updateApplicantField(field, value) {
    setApplicantData((prev) => {
      const next = { ...prev, [field]: value };

      if (field === 'treatmentDate' && value && prev.claimSubmissionDate) {
        const treatment = new Date(`${value}T00:00:00`);
        const submission = new Date(`${prev.claimSubmissionDate}T00:00:00`);
        if (submission < treatment) {
          next.claimSubmissionDate = value;
        }
      }

      if (field === 'claimSubmissionDate' && value && prev.treatmentDate) {
        const treatment = new Date(`${prev.treatmentDate}T00:00:00`);
        const submission = new Date(`${value}T00:00:00`);
        if (submission < treatment) {
          next.claimSubmissionDate = prev.treatmentDate;
        }
      }

      if (field === 'relationship' && value === 'SELF') {
        next.primaryMemberId = '';
      }

      return next;
    });
  }

  function showBlockers(blockers, title, subtitle) {
    setDialogTitle(title);
    setDialogSubtitle(subtitle);
    setSubmissionBlockers(blockers);
    setBlockDialogOpen(true);
  }

  function handleApplicantContinue() {
    const blockers = collectApplicantBlockers(applicantData);

    if (blockers.length > 0) {
      showBlockers(
        blockers,
        'Cannot Continue — Applicant Details Incomplete',
        'Please fix the following before moving to claim type selection.'
      );
      return;
    }

    setWizardStep('claim-type');
  }

  function handleClaimTypeSelect(type) {
    setSelectedClaimType(type);
    updateApplicantField('claimType', type);
  }

  function handleClaimTypeContinue() {
    if (!selectedClaimType) {
      showBlockers(
        [{ section: 'Claim Type', message: 'Please select a claim type to continue.' }],
        'Select a Claim Type',
        'Choose the type of medical claim you are filing.'
      );
      return;
    }

    updateApplicantField('claimType', selectedClaimType);
    setClaimDetails(null);
    setWizardStep('claim-form');
  }

  function handleClaimContinue(details) {
    setClaimDetails(details);
    setWizardStep('claim-summary');
  }

  async function handleClaimSubmit() {
    if (!onSubmit || !claimDetails) return;

    const blockers = collectApplicantBlockers(applicantData);
    if (blockers.length > 0) {
      showBlockers(
        blockers,
        'Cannot Submit — Date or Member Details Invalid',
        'Please fix the following issues before submitting your claim.'
      );
      return;
    }

    const formData = buildClaimFormData(applicantData, claimDetails);
    if (!formData) return;

    await onSubmit(formData);
  }

  const applicantSummary = {
    memberId: applicantData.memberId,
    memberName: applicantData.memberName || applicantData.memberId,
    treatmentDate: applicantData.treatmentDate,
    claimSubmissionDate: applicantData.claimSubmissionDate,
  };

  return (
    <div
      className={`mx-auto ${wizardStep === 'claim-form' || wizardStep === 'claim-summary' ? 'max-w-5xl' : 'max-w-4xl'}`}
    >
      <SubmissionBlockedDialog
        open={blockDialogOpen}
        blockers={submissionBlockers}
        onClose={() => setBlockDialogOpen(false)}
        title={dialogTitle}
        subtitle={dialogSubtitle}
      />

      <WizardProgress currentStep={wizardStep} />

      {wizardStep === 'applicant' && (
        <ApplicantStep
          values={applicantData}
          onChange={updateApplicantField}
          onContinue={handleApplicantContinue}
        />
      )}

      {wizardStep === 'claim-type' && (
        <ClaimTypeStep
          claimTypes={CLAIM_TYPES}
          selectedType={selectedClaimType}
          onSelect={handleClaimTypeSelect}
          onContinue={handleClaimTypeContinue}
          onBack={() => setWizardStep('applicant')}
        />
      )}

      {wizardStep === 'claim-form' && selectedClaimType && (
        <ClaimTypeFormPage
          claimType={selectedClaimType}
          applicantSummary={applicantSummary}
          onBack={() => setWizardStep('claim-type')}
          onChangeType={() => setWizardStep('claim-type')}
          onClaimContinue={handleClaimContinue}
        />
      )}

      {wizardStep === 'claim-summary' && claimDetails && (
        <ClaimSummaryStep
          applicantData={applicantData}
          claimDetails={claimDetails}
          onBack={() => setWizardStep('claim-form')}
          onSubmit={handleClaimSubmit}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
