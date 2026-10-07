function pageRange(current, total, siblings = 1) {
  const range = []
  const left = Math.max(2, current - siblings)
  const right = Math.min(total - 1, current + siblings)

  range.push(1)
  if (left > 2) range.push('…')
  for (let i = left; i <= right; i++) range.push(i)
  if (right < total - 1) range.push('…')
  if (total > 1) range.push(total)
  return range
}

function Btn({ onClick, disabled, active, children, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      aria-label={ariaLabel}
      className={
        'grid h-9 min-w-9 place-items-center rounded-lg border px-2 text-sm font-medium tabular-nums transition ' +
        (active
          ? 'border-brand-500 bg-brand-500 text-white shadow-sm'
          : disabled
            ? 'cursor-not-allowed border-slate-200 bg-white text-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-600'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800')
      }
    >
      {children}
    </button>
  )
}

export default function Pagination({ page, pages, onChange, disabled }) {
  if (!pages || pages <= 1) return null
  const items = pageRange(page, pages)

  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      <Btn
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 1}
        ariaLabel="Previous page"
      >
        ←
      </Btn>

      {items.map((p, i) =>
        p === '…' ? (
          <span key={'e' + i} className="px-2 text-slate-400">
            …
          </span>
        ) : (
          <Btn
            key={p}
            active={p === page}
            disabled={disabled}
            onClick={() => onChange(p)}
            ariaLabel={`Page ${p}`}
          >
            {p}
          </Btn>
        )
      )}

      <Btn
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= pages}
        ariaLabel="Next page"
      >
        →
      </Btn>
    </nav>
  )
}
