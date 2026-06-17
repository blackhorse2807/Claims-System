import { formatDocLabel, getDocumentRequirements } from '../data/policyData';

export default function RequiredDocumentsHint({ claimType, uploadedCategories = [] }) {
  const requirements = getDocumentRequirements(claimType);

  if (!claimType) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Select a <strong>Claim Type</strong> to see which documents you must upload.
      </div>
    );
  }

  if (!requirements) {
    return null;
  }

  const claimLabel = claimType.replace(/_/g, ' ');

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
      <p className="font-semibold text-sky-900">
        Documents required for {claimLabel}
      </p>

      <div className="mt-2 space-y-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-sky-700">Required</p>
          <ul className="mt-1 space-y-1">
            {requirements.required.map((docType) => {
              const uploaded = uploadedCategories.includes(docType);
              return (
                <li key={docType} className="flex items-center gap-2">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                      uploaded
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-white text-slate-400 ring-1 ring-sky-200'
                    }`}
                  >
                    {uploaded ? '✓' : '·'}
                  </span>
                  <span className={uploaded ? 'text-emerald-800' : 'text-sky-900'}>
                    {formatDocLabel(docType)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {requirements.optional.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-sky-600">Optional</p>
            <p className="mt-1 text-sky-800">
              {requirements.optional.map(formatDocLabel).join(', ')}
            </p>
          </div>
        )}
      </div>

      {uploadedCategories.length > 0 && (
        <p className="mt-3 border-t border-sky-200 pt-2 text-xs text-sky-700">
          Match each uploaded file to the correct document category below. All required documents
          must be included before your claim can be processed.
        </p>
      )}
    </div>
  );
}
