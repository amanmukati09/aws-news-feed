import { useMemo } from 'react'
import { categoryMeta } from '../lib/categories'
import { CategoryIcon } from '../lib/categoryIcons'

const SOURCE_LABELS = {
  'whats-new':    'What’s New',
  'news-blog':    'AWS News Blog',
  'ml-blog':      'ML Blog',
  'compute-blog': 'Compute Blog',
}

const STOP = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','at','by','from',
  'is','are','was','were','be','been','has','have','had','do','does','did','will',
  'you','your','we','our','us','it','its','this','that','these','those','as','if',
  'new','now','aws','amazon','announcing','introducing','launch','launches','launched',
  'available','generally','updates','update','supports','support',
  'feature','features','using','use','get','getting','start','started','based',
  'more','less','most','very','all','any','some','than','then','into','also',
  'no','not','yes','can','could','should','would','may','might','per','via',
  'about','across','between','after','before','over','under','within','without',
])

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w))
}

function extractTopics(items, limit = 8) {
  if (!items?.length) return []
  const counts = new Map()
  for (const it of items) {
    const words = new Set([
      ...tokenize(it.title),
      ...tokenize(it.summary || '').slice(0, 40),
    ])
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }))
}

function Row({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'group flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition ' +
        (active
          ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-700/25 dark:text-brand-100'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')
      }
    >
      {children}
    </button>
  )
}

function Panel({ title, count, children, action }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-3.5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
          {typeof count === 'number' && (
            <span className="ml-1.5 text-slate-400 dark:text-slate-500">· {count}</span>
          )}
        </h3>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

/**
 * Compact 14-day publication histogram from the current feed.
 * Bars are proportional to that day's item count; the max day is highlighted.
 * Shows volume at a glance — genuinely new signal.
 */
function ActivityPulse({ items }) {
  const data = useMemo(() => {
    if (!items?.length) return []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const byDay = new Array(14).fill(0)
    for (const it of items) {
      if (!it.published) continue
      const d = new Date(it.published)
      if (isNaN(d.getTime())) continue
      d.setHours(0, 0, 0, 0)
      const daysAgo = Math.round((today - d) / 86400000)
      if (daysAgo >= 0 && daysAgo < 14) byDay[13 - daysAgo] += 1
    }
    return byDay
  }, [items])

  if (!data.length) return null
  const max = Math.max(...data, 1)
  const total = data.reduce((a, b) => a + b, 0)
  if (total === 0) return null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-3.5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Activity
        </h3>
        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
          last 14 days
        </span>
      </div>

      <div className="flex h-10 items-end gap-[3px]">
        {data.map((v, i) => {
          const pct = v === 0 ? 8 : Math.max(14, Math.round((v / max) * 100))
          const isMax = v === max && max > 0
          return (
            <div
              key={i}
              title={`${v} item${v === 1 ? '' : 's'}`}
              className={
                'flex-1 rounded-sm transition ' +
                (isMax
                  ? 'bg-gradient-to-t from-aws-orange to-orange-400'
                  : v === 0
                    ? 'bg-slate-200 dark:bg-slate-800'
                    : 'bg-slate-300 hover:bg-brand-400 dark:bg-slate-700 dark:hover:bg-brand-500')
              }
              style={{ height: `${pct}%` }}
            />
          )
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>14d ago</span>
        <span className="font-mono tabular-nums">
          {total} item{total === 1 ? '' : 's'} · peak {max}/day
        </span>
        <span>today</span>
      </div>
    </div>
  )
}

function Inner({
  categories = [],
  sources = [],
  selectedCategories = [],
  selectedSources = [],
  onToggleCategory,
  onToggleSource,
  onClear,
  hasFilters,
  total,
  trendingItems = [],
  activeQuery = '',
  onPickTopic,
}) {
  const catsSel = new Set(selectedCategories)
  const srcsSel = new Set(selectedSources)
  const topics = useMemo(() => extractTopics(trendingItems, 8), [trendingItems])

  return (
    <div className="space-y-3">
      <ActivityPulse items={trendingItems} />

      {topics.length > 0 && (
        <Panel title="Trending topics">
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {topics.map((t) => {
              const active = activeQuery?.toLowerCase() === t.word
              return (
                <button
                  key={t.word}
                  type="button"
                  onClick={() => onPickTopic(t.word)}
                  title={`${t.count} mentions`}
                  className={
                    'group inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition ' +
                    (active
                      ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-700/25 dark:text-brand-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand-700 dark:hover:bg-brand-700/20')
                  }
                >
                  <span className="font-mono text-[10px] text-slate-400 group-hover:text-brand-500 dark:text-slate-500">
                    #
                  </span>
                  {t.word}
                  <span className={
                    'ml-0.5 rounded-full px-1 text-[9px] tabular-nums ' +
                    (active
                      ? 'bg-brand-100 text-brand-700 dark:bg-brand-700/40 dark:text-brand-100'
                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400')
                  }>
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>
        </Panel>
      )}

      <Panel
        title="Categories"
        count={categories.length}
        action={
          hasFilters && (
            <button
              type="button"
              onClick={onClear}
              className="text-[10px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300"
            >
              Clear
            </button>
          )
        }
      >
        <Row active={selectedCategories.length === 0} onClick={onClear}>
          <span>All categories</span>
          <span className="text-xs tabular-nums text-slate-400">{total}</span>
        </Row>

        {categories.map(([name, count]) => (
          <Row key={name} active={catsSel.has(name)} onClick={() => onToggleCategory(name)}>
            <span className="flex min-w-0 items-center gap-2">
              <span className={`${categoryMeta(name).dot} h-1.5 w-1.5 shrink-0 rounded-full`} />
              <CategoryIcon category={name} className="shrink-0 text-slate-400 dark:text-slate-500" />
              <span className="truncate">{name}</span>
            </span>
            <span className="text-xs tabular-nums text-slate-400">{count}</span>
          </Row>
        ))}
      </Panel>

      <Panel title="Sources" count={sources.length}>
        <Row active={selectedSources.length === 0} onClick={onClear}>
          <span>All sources</span>
        </Row>
        {sources.map((s) => (
          <Row key={s} active={srcsSel.has(s)} onClick={() => onToggleSource(s)}>
            <span className="truncate font-mono text-xs">{SOURCE_LABELS[s] || s}</span>
          </Row>
        ))}
      </Panel>

      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Clear all filters
        </button>
      )}
    </div>
  )
}

export default function Sidebar({ mobileOpen, onMobileClose, ...props }) {
  return (
    <>
      <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
        <Inner {...props} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onMobileClose} />
          <div className="absolute left-0 top-0 h-full w-80 max-w-[85vw] overflow-y-auto bg-white p-4 shadow-2xl dark:bg-slate-950">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Filters
              </h2>
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="Close filters"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <Inner {...props} />
          </div>
        </div>
      )}
    </>
  )
}