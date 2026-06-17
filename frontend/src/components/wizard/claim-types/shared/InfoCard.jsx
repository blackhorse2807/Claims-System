const VARIANTS = {
  default: 'border-slate-200 bg-white',
  coverage: 'border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50/80',
  documents: 'border-violet-100 bg-gradient-to-br from-violet-50 to-purple-50/60',
  notice: 'border-slate-200 bg-slate-50',
  success: 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/60',
  warning: 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/50',
};

const TITLE_COLORS = {
  default: 'text-slate-900',
  coverage: 'text-blue-900',
  documents: 'text-violet-900',
  notice: 'text-slate-800',
  success: 'text-emerald-900',
  warning: 'text-amber-900',
};

export default function InfoCard({ variant = 'default', title, icon, children, className = '' }) {
  return (
    <div
      className={`min-w-0 rounded-xl border p-5 shadow-sm ${VARIANTS[variant] || VARIANTS.default} ${className}`}
    >
      {title && (
        <div className="mb-3 flex items-center gap-2">
          {icon && <span className="text-lg leading-none">{icon}</span>}
          <h3 className={`text-sm font-semibold ${TITLE_COLORS[variant] || TITLE_COLORS.default}`}>
            {title}
          </h3>
        </div>
      )}
      <div className="min-w-0 text-sm text-slate-700">{children}</div>
    </div>
  );
}
