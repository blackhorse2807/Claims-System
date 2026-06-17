import { evaluateDateHardStops } from '../utils/dateHardStops';

function CheckRow({ label, passed, pending }) {
  let icon = '·';
  let iconClass = 'bg-slate-100 text-slate-400 ring-1 ring-slate-200';

  if (!pending) {
    if (passed) {
      icon = '✓';
      iconClass = 'bg-emerald-100 text-emerald-700';
    } else {
      icon = '✕';
      iconClass = 'bg-red-100 text-red-700';
    }
  }

  return (
    <li className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${iconClass}`}
      >
        {icon}
      </span>
      <span
        className={
          pending ? 'text-slate-500' : passed ? 'text-emerald-800' : 'text-red-700 font-medium'
        }
      >
        {label}
      </span>
    </li>
  );
}

export default function DateHardStopsPanel({ treatmentDate, claimSubmissionDate }) {
  const { checks, allPassed } = evaluateDateHardStops({
    treatmentDate,
    claimSubmissionDate,
  });

  const hasInput = Boolean(treatmentDate || claimSubmissionDate);

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        !hasInput
          ? 'border-slate-200 bg-slate-50'
          : allPassed
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">Date validation</p>
        {hasInput && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              allPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {allPassed ? 'All passed' : 'Action required'}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-500">
        Claim submission date must be on or after the treatment date.
      </p>

      <ul className="mt-3 space-y-2 text-sm">
        {checks.map((check) => (
          <CheckRow
            key={check.id}
            label={check.label}
            passed={check.passed}
            pending={check.pending}
          />
        ))}
      </ul>
    </div>
  );
}
