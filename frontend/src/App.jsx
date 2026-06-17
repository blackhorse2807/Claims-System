import { useState } from 'react';
import ClaimSubmissionPage from './components/ClaimSubmissionPage';
import DecisionView from './DecisionView';
import { apiUrl } from './config';

export default function App() {
  const [view, setView] = useState('form');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(formData) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl('/api/claims'), {
        method: 'POST',
        body: formData,
      });

      let data;
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok) {
        if (data.blocked || data.error || data.message) {
          setResult({ blocked: true, ...data });
          setView('result');
          return;
        }

        throw new Error(data.message || data.error || 'Claim submission failed');
      }

      setResult(data);
      setView('result');
    } catch (err) {
      setError(err.message || 'Could not connect to the claims server. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setView('form');
    setResult(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Claims Processing Portal</h1>
            <p className="mt-1 text-sm text-slate-500">
              Plum Group Health Insurance — PLUM_GHI_2024
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        </header>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && (
          <div className="rounded-xl border border-slate-200 bg-white py-16 text-center shadow-sm">
            <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-[3px] border-slate-200 border-t-blue-600" />
            <p className="text-sm font-medium text-slate-600">Processing your claim…</p>
            <p className="mt-1 text-xs text-slate-400">
              Verifying documents and checking policy rules
            </p>
          </div>
        )}

        {!loading && view === 'form' && (
          <ClaimSubmissionPage onSubmit={handleSubmit} isSubmitting={loading} />
        )}

        {!loading && view === 'result' && result && (
          <DecisionView result={result} onReset={handleReset} />
        )}
      </div>
    </div>
  );
}
