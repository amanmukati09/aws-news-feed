import { categoryMeta } from '../../lib/categories'
import { fmtDate } from '../../lib/format'

export default function SourceCards({ sources }) {
  if (!sources?.length) return null
  return (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Sources · {sources.length}
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {sources.map((s, i) => (
          <a
            key={s.id}
            href={s.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
          >
            <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 font-medium text-slate-700 group-hover:text-brand-600 dark:text-slate-200 dark:group-hover:text-brand-300">
                {s.title}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                {s.category && (
                  <span className={`rounded-full px-1.5 py-0.5 ring-1 ring-inset ${categoryMeta(s.category).pill}`}>
                    {s.category}
                  </span>
                )}
                <span>{fmtDate(s.published)}</span>
              </span>
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
