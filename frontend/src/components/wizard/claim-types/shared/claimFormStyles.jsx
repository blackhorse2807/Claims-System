export const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
export const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';
const errorClass = 'mt-1 text-xs text-red-600';

export function FieldError({ message }) {
  if (!message) return null;
  return <p className={errorClass}>{message}</p>;
}

export function formatInr(amount) {
  if (amount == null || Number.isNaN(amount)) return '—';
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}
