import { useEffect, useMemo, useRef, useState } from 'react'
import SearchBox from './SearchBox'

const SEEN_KEY = 'awsnews.seenIds'
const VISIT_KEY = 'awsnews.lastVisit'
const SEEN_MAX = 800

function IconBtn({ onClick, label, active, badge, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={
        'relative grid h-9 w-9 place-items-center rounded-lg transition ' +
        'hover:scale-105 active:scale-95 ' +
        (active
          ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200 dark:bg-brand-700/25 dark:text-brand-100 dark:ring-brand-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white')
      }
    >
      {children}
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-aws-orange px-1 text-[9px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}

function useOutsideClose(onClose) {
  const ref = useRef(null)
  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])
  return ref
}

function loadSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveSeen(ids) {
  try {
    const trimmed = ids.slice(-SEEN_MAX)
    localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed))
    localStorage.setItem(VISIT_KEY, String(Date.now()))
  } catch {}
}

function computeNewItems(items) {
  if (!items?.length) return { items: [], isFirstVisit: false }
  const seenArr = loadSeen()
  const isFirstVisit = seenArr === null
  if (isFirstVisit) {
    saveSeen(items.map((i) => i.id))
    return { items: [], isFirstVisit: true }
  }
  const seen = new Set(seenArr)
  const fresh = items.filter((i) => i.id && !seen.has(i.id))
  return { items: fresh, isFirstVisit: false }
}

function relativeTime(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (isNaN(t)) return ''
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

function NotificationsMenu({ open, onClose, items, onMarkAllRead, isFirstVisit }) {
  const ref = useOutsideClose(onClose)
  if (!open) return null
  const count = items.length
  return (
    <div
      ref={ref}
      className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Since your last visit
          </h3>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {isFirstVisit
              ? 'Tracking new posts from now on'
              : count === 0
                ? 'Nothing new'
                : `${count} new announcement${count === 1 ? '' : 's'}`}
          </p>
        </div>
        {count > 0 && (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="text-[11px] font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300"
          >
            Mark read
          </button>
        )}
      </div>

      {isFirstVisit ? (
        <div className="px-4 py-8 text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-700/20 dark:text-brand-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            We've noted the current feed.
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Next time you drop by, you'll see only what's new.
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
            You're all caught up
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            New AWS posts will show up here.
          </p>
        </div>
      ) : (
        <ul className="max-h-80 overflow-y-auto">
          {items.map((n) => (
            <li
              key={n.id}
              className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
            >
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="block px-4 py-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-aws-orange/15 text-aws-orange">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                      {n.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {n.category && (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800">
                          {n.category}
                        </span>
                      )}
                      <span>{relativeTime(n.published)}</span>
                    </p>
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const SHORTCUTS = [
  { keys: ['/'], label: 'Focus search' },
  { keys: ['Esc'], label: 'Clear focus / close' },
  { keys: ['⌘', 'K'], label: 'Command palette' },
  { keys: ['↑', '↓'], label: 'Navigate suggestions' },
  { keys: ['Enter'], label: 'Open / submit' },
]

const ABOUT_LINKS = [
  { href: 'https://aws.amazon.com/blogs/aws/', label: 'Official AWS Blogs' },
  { href: 'https://aws.amazon.com/about-aws/whats-new/recent/', label: 'AWS What’s New' },
  { href: 'https://docs.aws.amazon.com/', label: 'AWS Docs' },
]

function HelpMenu({ open, onClose, onOpenPalette }) {
  const ref = useOutsideClose(onClose)
  if (!open) return null
  return (
    <div
      ref={ref}
      className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Help & Shortcuts
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Quick keys and links
          </p>
        </div>
      </div>

      <div className="p-3">
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Shortcuts
        </p>
        <ul className="space-y-1">
          {SHORTCUTS.map((s, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300"
            >
              <span>{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-slate-100 p-1.5 dark:border-slate-800">
        <button
          type="button"
          onClick={() => { onOpenPalette(); onClose() }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4 text-slate-400">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h.01M11 14h.01M15 14h.01" />
          </svg>
          <span className="flex-1 text-left">Open command palette</span>
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="border-t border-slate-100 p-1.5 dark:border-slate-800">
        {ABOUT_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-slate-400">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <path d="M15 3h6v6M10 14 21 3" />
            </svg>
            <span className="flex-1">{l.label}</span>
          </a>
        ))}
      </div>

      <div className="border-t border-slate-100 px-3 py-2.5 dark:border-slate-800">
        <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
          Unofficial · Not affiliated with Amazon Web Services.
        </p>
      </div>
    </div>
  )
}

export default function Header({
  q,
  onSearchChange,
  onSearchSubmit,
  onCommitSearch,
  suggestionItems,
  recents,
  onClearRecents,
  onOpenPalette,
  lastRefresh,
  loading,
  dark,
  onToggleDark,
  onOpenSidebar,
  now,
  nextRefreshIn,
  onRefreshNow,
  density,
  onToggleDensity,
  bookmarksCount,
  showBookmarks,
  onToggleBookmarks,
}) {
  const [notifOpen, setNotifOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [markTick, setMarkTick] = useState(0)

  const { items: newItems, isFirstVisit } = useMemo(
    () => computeNewItems(suggestionItems || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suggestionItems, markTick]
  )

  const time = now
    ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : ''
  const tz = now
    ? Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace(/_/g, ' ')
    : ''
  const mins = Math.floor((nextRefreshIn || 0) / 60)
  const secs = (nextRefreshIn || 0) % 60
  const countdown = `${mins}:${String(secs).padStart(2, '0')}`

  function markAllRead() {
    const ids = (suggestionItems || []).map((i) => i.id).filter(Boolean)
    const existing = loadSeen() || []
    const merged = Array.from(new Set([...existing, ...ids]))
    saveSeen(merged)
    setMarkTick((t) => t + 1)
    setNotifOpen(false)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800/80 dark:bg-[#0a0f1e]/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSidebar}
            aria-label="Open filters"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>

          <a href="/" className="flex shrink-0 items-center gap-2.5">
            <div className="relative">
              <div className="absolute inset-0 rounded-lg bg-aws-orange opacity-40 blur-md" />
              <div className="relative grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-aws-orange to-orange-500 shadow-lg shadow-orange-500/25">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M3 15a4 4 0 004 4h10a4 4 0 100-8 6 6 0 00-11.5-2A4 4 0 003 15z" />
                </svg>
              </div>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-100">
                AWS News
              </h1>
              <p className="mt-0.5 text-[11px] leading-none text-slate-500 dark:text-slate-400">
                Dashboard
              </p>
            </div>
          </a>

          <SearchBox
            q={q}
            onChange={onSearchChange}
            onSubmit={onSearchSubmit}
            onCommitSearch={onCommitSearch}
            items={suggestionItems}
            recents={recents}
            onClearRecents={onClearRecents}
            onOpenPalette={onOpenPalette}
          />

          <div className="relative z-10 flex items-center gap-1">
            <div className="relative">
              <IconBtn
                label={
                  isFirstVisit
                    ? 'New since last visit'
                    : newItems.length > 0
                      ? `${newItems.length} new since last visit`
                      : 'No new items'
                }
                active={notifOpen}
                badge={newItems.length}
                onClick={() => { setNotifOpen((o) => !o); setHelpOpen(false) }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </IconBtn>
              <NotificationsMenu
                open={notifOpen}
                onClose={() => setNotifOpen(false)}
                items={newItems}
                onMarkAllRead={markAllRead}
                isFirstVisit={isFirstVisit}
              />
            </div>

            <IconBtn
              label={showBookmarks ? 'Show all' : 'Bookmarks only'}
              active={showBookmarks}
              badge={bookmarksCount > 0 && !showBookmarks ? bookmarksCount : 0}
              onClick={onToggleBookmarks}
            >
              <svg viewBox="0 0 24 24" fill={showBookmarks ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </IconBtn>

            <IconBtn
              label={density === 'compact' ? 'Comfortable view' : 'Compact view'}
              active={density === 'compact'}
              onClick={onToggleDensity}
            >
              {density === 'compact' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  <rect x="4" y="4" width="16" height="7" rx="1.5" />
                  <rect x="4" y="13" width="16" height="7" rx="1.5" />
                </svg>
              )}
            </IconBtn>

            <IconBtn label={dark ? 'Light mode' : 'Dark mode'} onClick={onToggleDark}>
              {dark ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </IconBtn>

            <div className="ml-1 hidden items-center gap-2 rounded-lg border border-slate-200 bg-white/60 px-2.5 py-1.5 text-[11px] tabular-nums text-slate-600 md:flex dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <span className="relative flex h-1.5 w-1.5">
                <span className={`absolute inline-flex h-full w-full rounded-full ${loading ? 'animate-ping bg-aws-orange' : 'bg-emerald-500'} opacity-75`} />
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${loading ? 'bg-aws-orange' : 'bg-emerald-500'}`} />
              </span>
              <span className="font-mono">{time}</span>
              <span className="text-slate-400">{tz}</span>
              {onRefreshNow && (
                <button
                  type="button"
                  onClick={onRefreshNow}
                  className="ml-1 border-l border-slate-200 pl-2 font-mono text-slate-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400 dark:hover:text-brand-300"
                  title="Refresh now"
                >
                  ↻ {countdown}
                </button>
              )}
            </div>

            <div className="relative">
              <IconBtn
                label="Help & shortcuts"
                active={helpOpen}
                onClick={() => { setHelpOpen((o) => !o); setNotifOpen(false) }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
                  <path d="M12 17h.01" />
                </svg>
              </IconBtn>
              <HelpMenu
                open={helpOpen}
                onClose={() => setHelpOpen(false)}
                onOpenPalette={onOpenPalette}
              />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}