import { buildClaimSummary } from '../../utils/claimSummaryHelpers';
import InfoCard from './claim-types/shared/InfoCard';

function SummarySection({ title, rows }) {
  return (
    <InfoCard variant="default" title={title} icon="📋">
      <dl className="divide-y divide-slate-100">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </InfoCard>
  );
}

export default function ClaimSummaryStep({
  applicantData,
  claimDetails,
  onBack,
  onSubmit,
  isSubmitting = false,
}) {
  const summary = buildClaimSummary(applicantData, claimDetails);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
        <div className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50 px-8 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
            Step 4 of 4
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-2xl">
              {summary.meta.icon}
            </span>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Review & Submit</h2>
              <p className="text-sm text-slate-500">
                Please review all details before submitting your {summary.meta.label.toLowerCase()}{' '}
                claim.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-8">
          <SummarySection title="Applicant Details" rows={summary.applicant} />
          <SummarySection title="Claim Details" rows={summary.claim} />

          <InfoCard variant="documents" title="Uploaded Documents" icon="📎">
            {summary.documents.length === 0 ? (
              <p className="text-slate-500">No documents uploaded.</p>
            ) : (
              <ul className="space-y-3">
                {summary.documents.map((doc) => (
                  <li
                    key={`${doc.category}-${doc.label}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-violet-100 bg-white/70 px-3 py-2.5"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{doc.category}</p>
                      <p className="text-xs text-slate-500">{doc.label}</p>
                    </div>
                    <span className="text-xs font-medium text-violet-700">{doc.size}</span>
                  </li>
                ))}
              </ul>
            )}
          </InfoCard>

          <InfoCard variant="notice" title="Before you submit" icon="ℹ️">
            <p>
              By submitting, you confirm that the information provided is accurate. Your claim will
              be processed after document verification and policy rule evaluation.
            </p>
          </InfoCard>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/50 px-8 py-5 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            ← Edit Claim Details
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Submitting…' : 'Submit Claim'}
          </button>
        </div>
      </div>
    </div>
  );
}
