export default function StaleBanner({ ageSeconds, ttl, onRefresh, loading }) {
  if (ageSeconds == null || ttl == null) return null
  if (ageSeconds < ttl) return null

  const mins = Math.max(1, Math.round(ageSeconds / 60))

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-amber-600 dark:text-amber-400">
        <path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
      <span className="text-amber-900 dark:text-amber-200">
        Showing cached data ({mins} min old). Live refresh failed or hasn't run yet.
      </span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="ml-auto rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-900"
      >
        {loading ? 'Refreshing…' : 'Refresh now'}
      </button>
    </div>
  )
}
