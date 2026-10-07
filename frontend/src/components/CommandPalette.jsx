import { useEffect, useMemo, useRef, useState } from 'react'

function Cmd({ active, onClick, onMouseEnter, icon, label, hint }) {
  return (
    <li
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={
        'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ' +
        (active
          ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100'
          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60')
      }
    >
      <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </li>
  )
}

export default function CommandPalette({
  open,
  onClose,
  categories = [],
  sources = [],
  onSelectCategory,
  onSelectSource,
  onClearFilters,
  onToggleDark,
  onToggleDensity,
  onToggleBookmarks,
  onRefresh,
  isDark,
  isCompact,
  showBookmarks,
}) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const commands = useMemo(() => {
    const list = []

    categories.forEach(([name, count]) =>
      list.push({
        id: 'cat-' + name,
        label: `Filter: ${name}`,
        hint: `${count}`,
        keywords: `category ${name} filter`,
        icon: '▸',
        run: () => onSelectCategory(name),
      })
    )

    sources.forEach((s) =>
      list.push({
        id: 'src-' + s,
        label: `Source: ${s}`,
        hint: '',
        keywords: `source ${s} feed`,
        icon: '▸',
        run: () => onSelectSource(s),
      })
    )

    list.push(
      {
        id: 'clear',
        label: 'Clear all filters',
        keywords: 'reset clear filters',
        icon: '✕',
        run: onClearFilters,
      },
      {
        id: 'dark',
        label: isDark ? 'Switch to light mode' : 'Switch to dark mode',
        keywords: 'theme dark light mode toggle',
        icon: '◐',
        run: onToggleDark,
      },
      {
        id: 'density',
        label: isCompact ? 'Comfortable density' : 'Compact density',
        keywords: 'layout density compact comfortable',
        icon: '▤',
        run: onToggleDensity,
      },
      {
        id: 'bookmarks',
        label: showBookmarks ? 'Show all articles' : 'Show bookmarks only',
        keywords: 'bookmarks saved favourites filter',
        icon: '★',
        run: onToggleBookmarks,
      },
      {
        id: 'refresh',
        label: 'Refresh feed',
        keywords: 'reload refresh fetch now',
        icon: '↻',
        run: onRefresh,
      },
    )

    return list
  }, [categories, sources, isDark, isCompact, showBookmarks,
      onSelectCategory, onSelectSource, onClearFilters,
      onToggleDark, onToggleDensity, onToggleBookmarks, onRefresh])

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    if (!ql) return commands
    return commands.filter((c) =>
      (c.label + ' ' + (c.keywords || '')).toLowerCase().includes(ql)
    )
  }, [q, commands])

  useEffect(() => { setIdx(0) }, [q])

  function handleKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const c = filtered[idx]
      if (c) {
        e.preventDefault()
        c.run()
        onClose()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-slate-400">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type a command or search…"
            className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:inline dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            ESC
          </kbd>
        </div>

        <ul role="listbox" className="max-h-96 overflow-auto p-2">
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No matching commands
            </li>
          )}
          {filtered.map((c, i) => (
            <Cmd
              key={c.id}
              active={i === idx}
              onMouseEnter={() => setIdx(i)}
              onClick={() => { c.run(); onClose() }}
              icon={c.icon}
              label={c.label}
              hint={c.hint}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}
