import { GENDERS, RELATIONSHIPS } from '../../schemas/claimSchema';

import { POLICY_PERIOD } from '../../data/policyData';

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';

export default function ApplicantStep({ values, onChange, onContinue }) {
  const showPrimaryMemberId = values.relationship && values.relationship !== 'SELF';

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
            Step 1 of 4
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Applicant Details</h2>
          <p className="mt-2 text-sm text-slate-500">
            Tell us who is filing this claim and when the treatment took place.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="memberId">
              Member ID <span className="text-red-500">*</span>
            </label>
            <input
              id="memberId"
              type="text"
              className={inputClass}
              placeholder="Enter member ID"
              value={values.memberId}
              onChange={(e) => onChange('memberId', e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="memberName">
              Member Name <span className="text-red-500">*</span>
            </label>
            <input
              id="memberName"
              type="text"
              className={inputClass}
              placeholder="Enter member name"
              value={values.memberName}
              onChange={(e) => onChange('memberName', e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="dob">
              Date of Birth <span className="text-red-500">*</span>
            </label>
            <input
              id="dob"
              type="date"
              className={inputClass}
              value={values.dob}
              onChange={(e) => onChange('dob', e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="gender">
              Gender <span className="text-red-500">*</span>
            </label>
            <select
              id="gender"
              className={inputClass}
              value={values.gender}
              onChange={(e) => onChange('gender', e.target.value)}
            >
              <option value="">Select gender</option>
              {GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {gender}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="relationship">
              Relationship <span className="text-red-500">*</span>
            </label>
            <select
              id="relationship"
              className={inputClass}
              value={values.relationship}
              onChange={(e) => onChange('relationship', e.target.value)}
            >
              {RELATIONSHIPS.map((rel) => (
                <option key={rel} value={rel}>
                  {rel}
                </option>
              ))}
            </select>
          </div>

          {showPrimaryMemberId && (
            <div>
              <label className={labelClass} htmlFor="primaryMemberId">
                Primary Member ID <span className="text-red-500">*</span>
              </label>
              <input
                id="primaryMemberId"
                type="text"
                className={inputClass}
                placeholder="Enter primary member ID"
                value={values.primaryMemberId}
                onChange={(e) => onChange('primaryMemberId', e.target.value)}
              />
            </div>
          )}

          <div>
            <label className={labelClass} htmlFor="treatmentDate">
              Date of Treatment <span className="text-red-500">*</span>
            </label>
            <input
              id="treatmentDate"
              type="date"
              className={inputClass}
              min={POLICY_PERIOD.start}
              max={POLICY_PERIOD.end}
              value={values.treatmentDate}
              onChange={(e) => onChange('treatmentDate', e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="claimSubmissionDate">
              Date of Claim Submission <span className="text-red-500">*</span>
            </label>
            <input
              id="claimSubmissionDate"
              type="date"
              className={inputClass}
              min={values.treatmentDate || POLICY_PERIOD.start}
              max={POLICY_PERIOD.end}
              value={values.claimSubmissionDate}
              onChange={(e) => onChange('claimSubmissionDate', e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Continue to Claim Type →
        </button>
      </div>
    </div>
  );
}
