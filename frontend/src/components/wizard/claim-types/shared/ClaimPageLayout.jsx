function MemberContextCard({ applicantSummary }) {
  return (
    <div className="mx-8 mt-6 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100/80 px-5 py-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Claiming for</p>
      <dl className="mt-2 grid gap-4 sm:grid-cols-2 text-sm">
        <div>
          <dt className="text-xs font-medium text-slate-500">Member Name</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {applicantSummary.memberName || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-500">Member ID</dt>
          <dd className="mt-0.5 font-semibold text-slate-900">
            {applicantSummary.memberId || '—'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function ClaimPageLayout({
  step = 3,
  icon,
  title,
  subtitle,
  applicantSummary,
  sidebar,
  children,
  onBack,
  onContinue,
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
        <div className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50 px-8 py-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
            Step {step} of 4
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl">
              {icon}
            </span>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
              <p className="text-sm text-slate-500">{subtitle}</p>
            </div>
          </div>
        </div>

        <MemberContextCard applicantSummary={applicantSummary} />

        <div className="grid gap-6 p-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">{children}</div>
          {sidebar && <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">{sidebar}</aside>}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 bg-slate-50/50 px-8 py-5 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Continue to Review →
          </button>
        </div>
      </div>
    </div>
  );
}
