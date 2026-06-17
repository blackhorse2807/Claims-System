import { getDocumentRequirements } from '../../data/policyData';

const CLAIM_TYPE_META = {
  CONSULTATION: {
    icon: '🩺',
    title: 'Consultation',
    description: 'Doctor visits, OPD consultations, and general physician appointments.',
  },
  DIAGNOSTIC: {
    icon: '🔬',
    title: 'Diagnostic',
    description: 'Lab tests, imaging, MRI, CT scans, and other diagnostic procedures.',
  },
  PHARMACY: {
    icon: '💊',
    title: 'Pharmacy',
    description: 'Prescription medicines purchased from a pharmacy.',
  },
  DENTAL: {
    icon: '🦷',
    title: 'Dental',
    description: 'Dental treatments, root canals, extractions, and oral care.',
  },
  VISION: {
    icon: '👓',
    title: 'Vision',
    description: 'Eye exams, spectacles, lenses, and vision-related care.',
  },
  ALTERNATIVE_MEDICINE: {
    icon: '🌿',
    title: 'Alternative Medicine',
    description: 'Ayurveda, homeopathy, and other approved alternative treatments.',
  },
};

export default function ClaimTypeStep({ claimTypes, selectedType, onSelect, onContinue, onBack }) {
  const requirements = selectedType ? getDocumentRequirements(selectedType) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
        <div className="border-b border-slate-100 bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-10 text-center text-white">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-200">
            Step 2 of 3
          </p>
          <h2 className="mt-2 text-2xl font-semibold">What type of claim are you filing?</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-blue-100">
            Select the category that best describes your medical expense. You&apos;ll be taken to a
            dedicated form for that claim type.
          </p>
        </div>

        <div className="p-8">
          <div className="grid gap-3 sm:grid-cols-2">
            {claimTypes.map((type) => {
              const meta = CLAIM_TYPE_META[type];
              const isSelected = selectedType === type;

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onSelect(type)}
                  className={`rounded-xl border-2 p-5 text-left transition ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-2xl">{meta?.icon || '📋'}</span>
                  <p className="mt-3 font-semibold text-slate-900">{meta?.title || type}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {meta?.description}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedType && requirements && (
            <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <p className="font-medium">
                Documents you&apos;ll need for {CLAIM_TYPE_META[selectedType]?.title}:
              </p>
              <p className="mt-1 text-sky-800">
                <strong>Required:</strong>{' '}
                {requirements.required.map((d) => d.replace(/_/g, ' ')).join(', ')}
              </p>
              {requirements.optional.length > 0 && (
                <p className="mt-1 text-sky-700">
                  <strong>Optional:</strong>{' '}
                  {requirements.optional.map((d) => d.replace(/_/g, ' ')).join(', ')}
                </p>
              )}
            </div>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              ← Back to Applicant Details
            </button>
            <button
              type="button"
              onClick={onContinue}
              disabled={!selectedType}
              className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue to {selectedType ? CLAIM_TYPE_META[selectedType]?.title : 'Claim'} Form →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
