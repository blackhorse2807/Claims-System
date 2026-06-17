const STEPS = [
  { id: 'applicant', label: 'Applicant Details' },
  { id: 'claim-type', label: 'Claim Type' },
  { id: 'claim-form', label: 'Claim Details' },
  { id: 'claim-summary', label: 'Review & Submit' },
];

export default function WizardProgress({ currentStep }) {
  const currentIndex = STEPS.findIndex((step) => step.id === currentStep);

  return (
    <nav aria-label="Application progress" className="mb-8">
      <ol className="flex items-center justify-between gap-2">
        {STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li key={step.id} className="flex flex-1 items-center">
              <div className="flex min-w-0 flex-1 flex-col items-center text-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition ${
                    isComplete
                      ? 'bg-emerald-600 text-white'
                      : isCurrent
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                        : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {isComplete ? '✓' : index + 1}
                </div>
                <span
                  className={`mt-2 hidden text-xs font-medium sm:block ${
                    isCurrent ? 'text-blue-700' : isComplete ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`mx-2 h-0.5 flex-1 ${
                    index < currentIndex ? 'bg-emerald-400' : 'bg-slate-200'
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
