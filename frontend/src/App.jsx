import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import FilterBar from './components/FilterBar'
import NewsFeed from './components/NewsFeed'
import Pagination from './components/Pagination'
import Footer from './components/Footer'
import StaleBanner from './components/StaleBanner'
import CommandPalette from './components/CommandPalette'
import ScrollTop from './components/ScrollTop'
import ChatButton from './components/ChatButton'
import ChatDrawer from './components/ChatDrawer'
import { getNews, getHealth, refreshFeeds } from './api/client'
import { useDarkMode } from './hooks/useDarkMode'
import { useDebounce } from './hooks/useDebounce'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useClock } from './hooks/useClock'
import { categoryMeta } from './lib/categories'
import { daysAgoISO } from './lib/format'

const PRESET_DAYS = { all: null, '1d': 1, '7d': 7, '30d': 30, '90d': 90 }
const TTL_SECONDS = 900
const REFRESH_INTERVAL_SECONDS = 300
const HEALTH_POLL_MS = 15000

export default function App() {
  // data
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [health, setHealth] = useState(null)
  const [syncing, setSyncing] = useState(false)

  // ui
  const [dark, setDark] = useDarkMode()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [density, setDensity] = useLocalStorage('awsnews.density', 'comfortable')

  // filters
  const [page, setPage] = useState(1)
  const [categories, setCategories] = useState([])
  const [sources, setSources] = useState([])
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('newest')
  const [datePreset, setDatePreset] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showBookmarks, setShowBookmarks] = useState(false)
  const debouncedQ = useDebounce(q, 300)

  // bookmarks + recents
  const [bookmarks, setBookmarks] = useLocalStorage('awsnews.bookmarks', [])
  const [recents, setRecents] = useLocalStorage('awsnews.recents', [])

  // toast
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const showToast = useCallback((msg) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

  // clock + auto refresh
  const now = useClock(1000)
  const [nextRefreshAt, setNextRefreshAt] = useState(() => Date.now() + REFRESH_INTERVAL_SECONDS * 1000)
  const nextRefreshIn = Math.max(0, Math.round((nextRefreshAt - now.getTime()) / 1000))

  // Derived date range
  const from = useMemo(() => {
    if (datePreset === 'custom') return customFrom || null
    const days = PRESET_DAYS[datePreset]
    return days ? daysAgoISO(days) : null
  }, [datePreset, customFrom])

  const to = useMemo(() => {
    if (datePreset === 'custom') return customTo || null
    return null
  }, [datePreset, customTo])

  useEffect(() => {
    setPage(1)
  }, [categories, sources, debouncedQ, sort, from, to, showBookmarks])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = { page, limit: 20, sort }
      if (categories.length) params.category = categories.join(',')
      if (sources.length) params.source = sources.join(',')
      if (debouncedQ) params.q = debouncedQ
      if (from) params.from = from
      if (to) params.to = to
      const d = await getNews(params)
      setData(d)
      setLastRefresh(new Date())
      setNextRefreshAt(Date.now() + REFRESH_INTERVAL_SECONDS * 1000)
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }, [page, categories, sources, debouncedQ, sort, from, to])

  useEffect(() => { load() }, [load])

  // Health polling
  const fetchHealth = useCallback(async () => {
    try {
      const h = await getHealth()
      setHealth(h)
      return h
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    let alive = true
    fetchHealth()
    const id = setInterval(() => {
      if (alive) fetchHealth()
    }, HEALTH_POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [fetchHealth])

  useEffect(() => {
    if (nextRefreshIn <= 0) {
      load()
      fetchHealth()
    }
  }, [nextRefreshIn, load, fetchHealth])

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * Commit a search term into recents.
   * Called ONLY from SearchBox on Enter / suggestion pick / recent pick.
   * Typing alone does NOT record.
   */
  const commitSearch = useCallback((term) => {
    const t = (term || '').trim()
    if (t.length < 2) return
    setRecents((prev) => {
      if (prev[0] === t) return prev
      return [t, ...prev.filter((x) => x !== t)].slice(0, 6)
    })
  }, [setRecents])

  const toggleBookmark = useCallback((id) => {
    setBookmarks((prev) => {
      const has = prev.includes(id)
      showToast(has ? 'Bookmark removed' : 'Article bookmarked')
      return has ? prev.filter((x) => x !== id) : [...prev, id]
    })
  }, [setBookmarks, showToast])

  const hasFilters =
    categories.length > 0 ||
    sources.length > 0 ||
    !!debouncedQ ||
    datePreset !== 'all' ||
    showBookmarks

  function toggleCategory(name) {
    setCategories((prev) => {
      const has = prev.includes(name)
      showToast(has ? `Removed category: ${name}` : `Filter: ${name}`)
      return has ? prev.filter((x) => x !== name) : [...prev, name]
    })
  }
  function toggleSource(name) {
    setSources((prev) => {
      const has = prev.includes(name)
      showToast(has ? `Removed source: ${name}` : `Source: ${name}`)
      return has ? prev.filter((x) => x !== name) : [...prev, name]
    })
  }
  function clearAll() {
    setCategories([])
    setSources([])
    setQ('')
    setDatePreset('all')
    setCustomFrom('')
    setCustomTo('')
    setSort('newest')
    setShowBookmarks(false)
    showToast('Filters cleared')
  }

  const handleToggleDark = () => {
    const next = !dark
    setDark(next)
    showToast(next ? 'Dark mode' : 'Light mode')
  }
  const handleToggleDensity = () => {
    const next = density === 'compact' ? 'comfortable' : 'compact'
    setDensity(next)
    showToast(`Density: ${next}`)
  }
  const handleToggleBookmarks = () => {
    const next = !showBookmarks
    setShowBookmarks(next)
    if (next && bookmarks.length === 0) {
      showToast('No bookmarks yet — hover a card and click 🔖')
    } else {
      showToast(next ? 'Showing bookmarks only' : 'Showing all articles')
    }
  }

  const handleRefreshNow = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    showToast('Syncing feeds…')
    try {
      await refreshFeeds()
      await fetchHealth()
      await load()
      showToast('Feeds updated')
    } catch {
      showToast('Refresh failed')
    } finally {
      setSyncing(false)
    }
  }, [syncing, fetchHealth, load, showToast])

  const handleTopicClick = useCallback((word) => {
    setQ((prev) => (prev.toLowerCase() === word.toLowerCase() ? '' : word))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const displayItems = useMemo(() => {
    let items = data?.items || []
    if (showBookmarks) items = items.filter((i) => bookmarks.includes(i.id))
    return items
  }, [data, showBookmarks, bookmarks])

  const footerStats = useMemo(() => {
    const ageSeconds = health?.cache_age_seconds
    let lastSync = '—'
    if (typeof ageSeconds === 'number' && isFinite(ageSeconds)) {
      if (ageSeconds < 60) lastSync = `${Math.round(ageSeconds)}s ago`
      else lastSync = `${Math.round(ageSeconds / 60)}m ago`
    } else if (lastRefresh) {
      lastSync = 'just now'
    }
    return {
      total: data?.total ?? '—',
      sources: data?.sources?.length ?? '—',
      categories: data?.categories?.length ?? '—',
      lastSync,
    }
  }, [data, health, lastRefresh])

  const sidebarProps = {
    categories: data?.categories || [],
    sources: data?.sources || [],
    selectedCategories: categories,
    selectedSources: sources,
    onToggleCategory: toggleCategory,
    onToggleSource: toggleSource,
    onClear: clearAll,
    hasFilters,
    total: data?.total ?? 0,
    trendingItems: data?.items || [],
    activeQuery: debouncedQ,
    onPickTopic: handleTopicClick,
  }

  return (
    <div className="relative z-10 flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50/40 text-slate-900 dark:from-[#0a0f1e] dark:via-[#0a1220] dark:to-[#0a1628] dark:text-slate-100">
      <Header
        q={q}
        onSearchChange={setQ}
        onSearchSubmit={load}
        onCommitSearch={commitSearch}
        suggestionItems={data?.items || []}
        recents={recents}
        onClearRecents={() => setRecents([])}
        onOpenPalette={() => setPaletteOpen(true)}
        lastRefresh={lastRefresh}
        loading={loading || syncing}
        dark={dark}
        onToggleDark={handleToggleDark}
        onOpenSidebar={() => setSidebarOpen(true)}
        now={now}
        nextRefreshIn={nextRefreshIn}
        onRefreshNow={handleRefreshNow}
        density={density}
        onToggleDensity={handleToggleDensity}
        bookmarksCount={bookmarks.length}
        showBookmarks={showBookmarks}
        onToggleBookmarks={handleToggleBookmarks}
      />

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Sidebar
            {...sidebarProps}
            mobileOpen={sidebarOpen}
            onMobileClose={() => setSidebarOpen(false)}
          />

          <main className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">
                {showBookmarks
                  ? 'Bookmarked articles'
                  : hasFilters
                    ? 'Filtered results'
                    : 'Latest announcements'}
              </h2>
              {data && (
                <p className="shrink-0 text-sm text-slate-500 dark:text-slate-400">
                  {displayItems.length} article{displayItems.length === 1 ? '' : 's'}
                </p>
              )}
            </div>

            <StaleBanner
              ageSeconds={health?.cache_age_seconds}
              ttl={TTL_SECONDS}
              onRefresh={handleRefreshNow}
              loading={syncing}
            />

            <FilterBar
              sort={sort}
              onSortChange={setSort}
              datePreset={datePreset}
              onDatePresetChange={setDatePreset}
              customFrom={customFrom}
              customTo={customTo}
              onCustomFromChange={setCustomFrom}
              onCustomToChange={setCustomTo}
              selectedCategories={categories}
              selectedSources={sources}
              onRemoveCategory={toggleCategory}
              onRemoveSource={toggleSource}
              q={debouncedQ}
              onClearQ={() => setQ('')}
              onClearAll={clearAll}
              hasFilters={hasFilters}
              total={data?.total ?? 0}
              shown={data?.items?.length ?? 0}
            />

            <NewsFeed
              items={displayItems}
              loading={loading}
              error={error}
              onRetry={load}
              query={debouncedQ}
              compact={density === 'compact'}
              bookmarks={bookmarks}
              onToggleBookmark={toggleBookmark}
              onTopicClick={handleTopicClick}
              emptyTitle={showBookmarks ? 'No bookmarks yet' : 'No articles match your filters'}
              emptyHint={
                showBookmarks
                  ? 'Hover any card in the main feed and click the bookmark icon to save it here.'
                  : 'Try clearing filters or widening the date range.'
              }
            />

            {!showBookmarks && (
              <Pagination
                page={page}
                pages={data?.pages || 1}
                onChange={setPage}
                disabled={loading}
              />
            )}
          </main>
        </div>
      </div>

      <Footer stats={footerStats} onCategoryClick={toggleCategory} />

      <ScrollTop />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        categories={data?.categories || []}
        sources={data?.sources || []}
        onSelectCategory={toggleCategory}
        onSelectSource={toggleSource}
        onClearFilters={clearAll}
        onToggleDark={handleToggleDark}
        onToggleDensity={handleToggleDensity}
        onToggleBookmarks={handleToggleBookmarks}
        onRefresh={handleRefreshNow}
        isDark={dark}
        isCompact={density === 'compact'}
        showBookmarks={showBookmarks}
      />

      <ChatButton onClick={() => setChatOpen((o) => !o)} open={chatOpen} />
      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-[60] max-w-[calc(100vw-2rem)] -translate-x-1/2 truncate rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-2xl ring-1 ring-white/10 sm:bottom-6 dark:bg-slate-100 dark:text-slate-900"
        >
          {toast}
        </div>
      )}
    </div>
  )
}