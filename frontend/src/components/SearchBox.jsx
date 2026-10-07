import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { categoryMeta } from '../lib/categories'

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function Highlight({ text, query }) {
  if (!query || !text || query.length < 2) return text
  try {
    const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'))
    return (
      <>
        {parts.map((p, i) =>
          p.toLowerCase() === query.toLowerCase()
            ? <mark key={i}>{p}</mark>
            : <Fragment key={i}>{p}</Fragment>
        )}
      </>
    )
  } catch {
    return text
  }
}

function buildGroups(items, query, limit = 8) {
  const q = query.trim().toLowerCase()
  if (!q || items.length === 0) return []

  const scored = []
  for (const it of items) {
    const t = (it.title || '').toLowerCase()
    const s = (it.summary || '').toLowerCase()
    let score = 0
    if (t.startsWith(q)) score = 4
    else if (t.includes(q)) score = 3
    else if (s.includes(q)) score = 1
    if (score) scored.push({ item: it, score })
  }

  scored.sort((a, b) => b.score - a.score)

  const groups = new Map()
  for (const { item } of scored.slice(0, 20)) {
    const cat = item.category || 'Other'
    if (!groups.has(cat)) groups.set(cat, [])
    const bucket = groups.get(cat)
    if (bucket.length < 3) bucket.push(item)
  }

  return [...groups.entries()]
    .map(([category, items]) => ({ category, items }))
    .slice(0, limit)
}

export default function SearchBox({
  q,
  onChange,
  onSubmit,          // called when user presses Enter with no active suggestion
  onCommitSearch,    // called with the final search term (recents tracking)
  items = [],
  recents = [],
  onClearRecents,
  onOpenPalette,
}) {
  const [focused, setFocused] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  // Global "/" to focus
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea'
      if (e.key === '/' && !typing) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setFocused(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const groups = useMemo(
    () => (q.trim().length >= 2 ? buildGroups(items, q) : []),
    [q, items]
  )

  const showRecents = focused && !q.trim() && recents.length > 0
  const showSuggestions = focused && q.trim().length >= 2 && groups.length > 0
  const showNoMatch = focused && q.trim().length >= 2 && groups.length === 0

  const flat = useMemo(() => {
    if (showRecents) return recents.slice(0, 6).map((r) => ({ kind: 'recent', value: r }))
    if (showSuggestions) {
      const rows = []
      for (const g of groups) {
        for (const it of g.items) rows.push({ kind: 'item', item: it })
      }
      return rows
    }
    return []
  }, [showRecents, showSuggestions, recents, groups])

  useEffect(() => { setActiveIdx(-1) }, [q, focused])

  /**
   * Record `term` as committed (adds to recents), only if it's
   * meaningfully long and different from the last commit.
   */
  function commit(term) {
    const t = (term || '').trim()
    if (t.length >= 2) onCommitSearch?.(t)
  }

  function choose(entry) {
    if (!entry) return
    if (entry.kind === 'recent') {
      onChange(entry.value)
      commit(entry.value)
    } else if (entry.kind === 'item') {
      onChange(entry.item.title)
      commit(entry.item.title)
    }
    setFocused(false)
    setActiveIdx(-1)
    inputRef.current?.blur()
  }

  function handleKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && flat[activeIdx]) {
        e.preventDefault()
        choose(flat[activeIdx])
      } else {
        e.preventDefault()
        commit(q)
        onSubmit?.()
        setFocused(false)
        inputRef.current?.blur()
      }
    } else if (e.key === 'Escape') {
      setFocused(false)
      setActiveIdx(-1)
      inputRef.current?.blur()
    }
  }

  function clearInput() {
    onChange('')
    inputRef.current?.focus()
  }

  const showDropdown = showRecents || showSuggestions || showNoMatch

  return (
    <div ref={wrapRef} className="relative mx-auto w-full max-w-xl">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>

      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKey}
        placeholder="Search AWS announcements…"
        aria-label="Search AWS announcements"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        className="h-10 w-full rounded-lg border border-transparent bg-slate-100 pl-9 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-600 dark:focus:bg-slate-800"
      />

      {q && (
        <button
          type="button"
          onClick={clearInput}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-3.5 w-3.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}

      {showDropdown && (
        <div className="absolute left-0 right-0 top-12 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">

          {showRecents && (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Recent
                </span>
                <button
                  type="button"
                  onClick={onClearRecents}
                  className="text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  Clear
                </button>
              </div>
              <ul role="listbox" className="py-1">
                {recents.slice(0, 6).map((r, i) => (
                  <li
                    key={r}
                    role="option"
                    aria-selected={activeIdx === i}
                    onMouseEnter={() => setActiveIdx(i)}
                    onMouseDown={(e) => { e.preventDefault(); choose({ kind: 'recent', value: r }) }}
                    className={
                      'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ' +
                      (activeIdx === i
                        ? 'bg-slate-100 dark:bg-slate-800'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60')
                    }
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0 text-slate-400">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    <span className="truncate text-slate-700 dark:text-slate-200">{r}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {showSuggestions && (() => {
            let rowIndex = -1
            return groups.map((g) => (
              <div key={g.category} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {g.category}
                </p>
                <ul role="listbox" className="pb-1">
                  {g.items.map((it) => {
                    rowIndex += 1
                    const isActive = rowIndex === activeIdx
                    const dot = categoryMeta(it.category).dot
                    return (
                      <li
                        key={it.id}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIdx(rowIndex)}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          choose({ kind: 'item', item: it })
                        }}
                        className={
                          'flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm ' +
                          (isActive
                            ? 'bg-slate-100 dark:bg-slate-800'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60')
                        }
                      >
                        <span className={'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ' + dot} />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 text-slate-700 dark:text-slate-200">
                            <Highlight text={it.title} query={q.trim()} />
                          </p>
                          {it.summary && (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <Highlight text={it.summary} query={q.trim()} />
                            </p>
                          )}
                        </div>
                        <span className="mt-0.5 shrink-0 font-mono text-[10px] text-slate-400">
                          {it.source}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          })()}

          {showNoMatch && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                No matching announcements
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Try different keywords, or browse by category in the sidebar.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}