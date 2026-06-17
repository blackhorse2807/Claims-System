import { useEffect } from 'react';
import { groupBlockersBySection } from '../utils/collectSubmissionBlockers';

export default function SubmissionBlockedDialog({
  open,
  blockers,
  onClose,
  title = 'Unable to Submit Claim',
  subtitle = 'Please fix the following issues before submitting your claim.',
}) {
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const grouped = groupBlockersBySection(blockers);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submission-blocked-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close dialog"
      />

      <div className="relative w-full max-w-lg animate-slide-in rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-lg text-red-600">
              !
            </span>
            <div>
              <h2 id="submission-blocked-title" className="text-lg font-semibold text-slate-900">
                {title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-6 py-5">
          {grouped.length === 0 ? (
            <p className="text-sm text-slate-600">
              Please review the form and complete all required fields.
            </p>
          ) : (
            <div className="space-y-5">
              {grouped.map(({ section, messages }) => (
                <div key={section}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {section}
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {messages.map((message) => (
                      <li
                        key={message}
                        className="flex items-start gap-2.5 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-800"
                      >
                        <span className="mt-0.5 shrink-0 font-bold text-red-500">•</span>
                        <span>{message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Got it, I&apos;ll fix these
          </button>
        </div>
      </div>
    </div>
  );
}
