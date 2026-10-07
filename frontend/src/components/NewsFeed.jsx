import NewsCard from './NewsCard'

function SkeletonCard({ compact }) {
  return (
    <div
      className={
        'animate-pulse rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0f172a] ' +
        (compact ? 'p-3.5' : 'p-5')
      }
    >
      <div className="flex gap-2">
        <div className="h-5 w-5 rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="h-5 w-24 rounded-full bg-slate-100 dark:bg-slate-800/60" />
      </div>
      <div className="mt-4 h-5 w-4/5 rounded bg-slate-200 dark:bg-slate-800" />
      {!compact && (
        <>
          <div className="mt-3 h-4 w-full rounded bg-slate-100 dark:bg-slate-800/60" />
          <div className="mt-2 h-4 w-11/12 rounded bg-slate-100 dark:bg-slate-800/60" />
        </>
      )}
    </div>
  )
}

export default function NewsFeed({
  items,
  loading,
  error,
  onRetry,
  query,
  compact = false,
  bookmarks = [],
  onToggleBookmark,
  onTopicClick,
  emptyTitle,
  emptyHint,
}) {
  if (loading && (!items || items.length === 0)) {
    return (
      <div className={compact ? 'space-y-2.5' : 'space-y-4'} aria-busy="true" aria-live="polite">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} compact={compact} />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/30">
        <p className="font-medium text-red-800 dark:text-red-300">Failed to load news</p>
        <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-[#0f172a]">
        <p className="font-medium text-slate-700 dark:text-slate-200">
          {emptyTitle || 'No articles match your filters'}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {emptyHint || 'Try clearing filters or widening the date range.'}
        </p>
      </div>
    )
  }

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-4'}>
      {items.map((it) => (
        <NewsCard
          key={it.id}
          item={it}
          query={query}
          compact={compact}
          bookmarked={bookmarks.includes(it.id)}
          onToggleBookmark={onToggleBookmark}
          onTopicClick={onTopicClick}
        />
      ))}
    </div>
  )
}