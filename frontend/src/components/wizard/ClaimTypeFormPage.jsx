import AlternativeMedicineClaimPage from './claim-types/AlternativeMedicineClaimPage';
import ConsultationClaimPage from './claim-types/ConsultationClaimPage';
import DiagnosticClaimPage from './claim-types/DiagnosticClaimPage';
import DentalClaimPage from './claim-types/DentalClaimPage';
import PharmacyClaimPage from './claim-types/PharmacyClaimPage';
import VisionClaimPage from './claim-types/VisionClaimPage';

const CLAIM_TYPE_META = {
  CONSULTATION: { icon: '🩺', title: 'Consultation Claim' },
  DIAGNOSTIC: { icon: '🔬', title: 'Diagnostic Claim' },
  PHARMACY: { icon: '💊', title: 'Pharmacy Claim' },
  DENTAL: { icon: '🦷', title: 'Dental Claim' },
  VISION: { icon: '👓', title: 'Vision Claim' },
  ALTERNATIVE_MEDICINE: { icon: '🌿', title: 'Alternative Medicine Claim' },
};

function PlaceholderClaimPage({ claimType, applicantSummary, onBack, onChangeType }) {
  const meta = CLAIM_TYPE_META[claimType] || { icon: '📋', title: 'Claim' };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-8 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
            Step 3 of 3
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="text-3xl">{meta.icon}</span>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{meta.title}</h2>
              <p className="text-sm text-slate-500">This claim type form is coming soon.</p>
            </div>
          </div>
        </div>

        <div className="p-8 text-center">
          <p className="text-4xl">🚧</p>
          <p className="mt-4 text-sm text-slate-500">
            Member: {applicantSummary.memberName} · Treatment: {applicantSummary.treatmentDate}
          </p>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-8 py-5 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Back to Claim Type
          </button>
          <button
            type="button"
            onClick={onChangeType}
            className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            Change claim type
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClaimTypeFormPage({
  claimType,
  applicantSummary,
  onBack,
  onChangeType,
  onClaimContinue,
  highlightMissingTypes = [],
  initialClaimDetails = null,
}) {
  const sharedProps = {
    applicantSummary,
    onBack,
    onContinue: onClaimContinue,
    highlightMissingTypes,
    initialClaimDetails,
  };

  if (claimType === 'CONSULTATION') {
    return <ConsultationClaimPage {...sharedProps} />;
  }

  if (claimType === 'DIAGNOSTIC') {
    return <DiagnosticClaimPage {...sharedProps} />;
  }

  if (claimType === 'PHARMACY') {
    return <PharmacyClaimPage {...sharedProps} />;
  }

  if (claimType === 'DENTAL') {
    return <DentalClaimPage {...sharedProps} />;
  }

  if (claimType === 'VISION') {
    return <VisionClaimPage {...sharedProps} />;
  }

  if (claimType === 'ALTERNATIVE_MEDICINE') {
    return <AlternativeMedicineClaimPage {...sharedProps} />;
  }

  return (
    <PlaceholderClaimPage
      claimType={claimType}
      applicantSummary={applicantSummary}
      onBack={onBack}
      onChangeType={onChangeType}
    />
  );
}
