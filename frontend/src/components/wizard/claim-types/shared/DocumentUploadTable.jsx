import { formatFileSize } from '../../../../utils/documentUpload';

export default function DocumentUploadTable({
  specs,
  uploads,
  errors,
  showErrors,
  fileInputRefs,
  onFileSelect,
  requiredIds = null,
}) {
  const requiredSet = requiredIds ? new Set(requiredIds) : new Set(specs.map((s) => s.id));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Document</th>
            <th className="hidden px-4 py-3 sm:table-cell">Formats</th>
            <th className="hidden px-4 py-3 md:table-cell">Max size</th>
            <th className="px-4 py-3">Status</th>
            <th className="w-[22%] whitespace-nowrap px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {specs.map((spec) => {
            const file = uploads[spec.id];
            const docError = showErrors ? errors[`doc_${spec.id}`] : null;
            const isRequired = requiredSet.has(spec.id);

            return (
              <tr key={spec.id} className={docError ? 'bg-red-50/40' : 'bg-white'}>
                <td className="px-4 py-4 align-top">
                  <p className="font-medium text-slate-900">
                    {spec.label}
                    {isRequired ? <span className="text-red-500"> *</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 sm:hidden">
                    {spec.formats} · {spec.maxSizeMb} MB max
                  </p>
                  {docError ? <p className="mt-1 text-xs text-red-600">{docError}</p> : null}
                </td>
                <td className="hidden px-4 py-4 align-top text-slate-600 sm:table-cell">
                  {spec.formats}
                </td>
                <td className="hidden px-4 py-4 align-top text-slate-600 md:table-cell">
                  {spec.maxSizeMb} MB
                </td>
                <td className="min-w-0 px-4 py-4 align-top">
                  {file ? (
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        ✓ Uploaded
                      </span>
                      <p className="mt-1 truncate text-xs text-slate-600" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-400">{formatFileSize(file.size)}</p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Not uploaded</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-4 align-top text-right">
                  <input
                    ref={(el) => {
                      fileInputRefs.current[spec.id] = el;
                    }}
                    type="file"
                    accept={spec.accept}
                    className="hidden"
                    onChange={(e) => {
                      onFileSelect(spec.id, e.target.files?.[0] || null);
                      e.target.value = '';
                    }}
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    {file ? (
                      <button
                        type="button"
                        onClick={() => onFileSelect(spec.id, null)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[spec.id]?.click()}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {file ? 'Replace' : 'Upload'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
