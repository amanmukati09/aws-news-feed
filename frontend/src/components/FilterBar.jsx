import { useEffect, useRef, useState } from 'react'
import { categoryMeta } from '../lib/categories'

const SORTS = [
  { value: 'newest',     label: 'Newest first' },
  { value: 'oldest',     label: 'Oldest first' },
  { value: 'title_asc',  label: 'Title A → Z' },
  { value: 'title_desc', label: 'Title Z → A' },
]

const PRESETS = [
  { value: 'all', label: 'All time', days: null },
  { value: '1d',  label: 'Last 24h', days: 1 },
  { value: '7d',  label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
  { value: 'custom', label: 'Custom range', days: null },
]

function Select({ value, onChange, options, label, ariaLabel }) {
  return (
    <label className="relative inline-flex items-center">
      {label && (
        <span className="mr-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="h-9 rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm font-medium text-slate-700 shadow-sm outline-none transition hover:bg-slate-50 focus:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        style={{
          appearance: 'none',
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round'><path d='m6 9 6 6 6-6'/></svg>\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Chip({ label, onRemove, dot }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1.5 text-xs font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
      {dot && <span className={'h-1.5 w-1.5 rounded-full ' + dot} />}
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="grid h-4 w-4 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="h-3 w-3">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </span>
  )
}

function DateRangePopover({ open, onClose, from, to, onChangeFrom, onChangeTo, onApply, onClear }) {
  const ref = useRef(null)
  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className="absolute left-0 top-11 z-40 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900"
    >
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Date range
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] text-slate-500 dark:text-slate-400">From</span>
          <input
            type="date"
            value={from || ''}
            onChange={(e) => onChangeFrom(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-900 outline-none focus:border-slate-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] text-slate-500 dark:text-slate-400">To</span>
          <input
            type="date"
            value={to || ''}
            onChange={(e) => onChangeTo(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-900 outline-none focus:border-slate-300 focus:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onApply}
          className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

export default function FilterBar({
  sort,
  onSortChange,
  datePreset,
  onDatePresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  selectedCategories = [],
  selectedSources = [],
  onRemoveCategory,
  onRemoveSource,
  q,
  onClearQ,
  onClearAll,
  hasFilters,
  // summary
  total,
  shown,
}) {
  const [rangeOpen, setRangeOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const chips = []

  selectedCategories.forEach((c) =>
    chips.push(
      <Chip
        key={'c-' + c}
        label={c}
        dot={categoryMeta(c).dot}
        onRemove={() => onRemoveCategory(c)}
      />
    )
  )

  selectedSources.forEach((s) =>
    chips.push(<Chip key={'s-' + s} label={s} onRemove={() => onRemoveSource(s)} />)
  )

  if (q) chips.push(<Chip key="q" label={`“${q}”`} onRemove={onClearQ} />)

  if (datePreset === 'custom' && (customFrom || customTo)) {
    const label = `${customFrom || '…'} → ${customTo || '…'}`
    chips.push(
      <Chip
        key="range"
        label={label}
        onRemove={() => {
          onCustomFromChange('')
          onCustomToChange('')
          onDatePresetChange('all')
        }}
      />
    )
  }

  async function copyFilters() {
    try {
      const params = new URLSearchParams()
      if (sort !== 'newest') params.set('sort', sort)
      if (datePreset !== 'all') params.set('range', datePreset)
      if (customFrom) params.set('from', customFrom)
      if (customTo) params.set('to', customTo)
      if (selectedCategories.length) params.set('cat', selectedCategories.join(','))
      if (selectedSources.length) params.set('src', selectedSources.join(','))
      if (q) params.set('q', q)
      const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  return (
    <div className="mb-5 space-y-3">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          label="Sort"
          ariaLabel="Sort order"
          value={sort}
          onChange={onSortChange}
          options={SORTS}
        />

        <div className="relative">
          <Select
            label="Range"
            ariaLabel="Date range"
            value={datePreset}
            onChange={(v) => {
              onDatePresetChange(v)
              if (v === 'custom') setRangeOpen(true)
            }}
            options={PRESETS.map((p) => ({ value: p.value, label: p.label }))}
          />
          <DateRangePopover
            open={rangeOpen}
            onClose={() => setRangeOpen(false)}
            from={customFrom}
            to={customTo}
            onChangeFrom={onCustomFromChange}
            onChangeTo={onCustomToChange}
            onApply={() => setRangeOpen(false)}
            onClear={() => {
              onCustomFromChange('')
              onCustomToChange('')
              onDatePresetChange('all')
              setRangeOpen(false)
            }}
          />
        </div>

        {hasFilters && (
          <>
            <button
              type="button"
              onClick={copyFilters}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              title="Copy a link that reproduces these filters"
            >
              {copied ? (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-3.5 w-3.5 text-emerald-500">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
                  </svg>
                  Share filters
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClearAll}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-brand-600 transition hover:bg-brand-50 hover:text-brand-700 dark:text-brand-300 dark:hover:bg-brand-700/20"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Reset all
            </button>
          </>
        )}
      </div>

      {/* Active chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Active
          </span>
          {chips}
        </div>
      )}

      {/* Results summary */}
      {typeof total === 'number' && (
        <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="h-1 w-1 rounded-full bg-emerald-500" />
          <span>
            Showing <strong className="font-semibold text-slate-700 dark:text-slate-200">{shown ?? total}</strong> of{' '}
            <strong className="font-semibold text-slate-700 dark:text-slate-200">{total}</strong> matching
            {chips.length > 0 && (
              <> · {chips.length} filter{chips.length === 1 ? '' : 's'} applied</>
            )}
          </span>
        </div>
      )}
    </div>
  )
}