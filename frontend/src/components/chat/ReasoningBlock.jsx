import { useState } from 'react'

export default function ReasoningBlock({ text, streaming }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  return (
    <div className="mb-2 rounded-lg border border-violet-200 bg-violet-50/60 dark:border-violet-900 dark:bg-violet-950/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs"
      >
        <span className={
          'grid h-5 w-5 place-items-center rounded-md text-white ' +
          (streaming ? 'bg-violet-500 animate-pulse' : 'bg-violet-500')
        }>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        </span>
        <span className="font-medium text-violet-800 dark:text-violet-200">
          {streaming ? 'Reasoning…' : 'Reasoning'}
        </span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={'ml-auto h-3 w-3 text-violet-400 transition-transform ' + (open ? 'rotate-90' : '')}
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>
      {open && (
        <pre className="whitespace-pre-wrap border-t border-violet-200 px-2.5 py-2 text-[11px] text-violet-900/90 dark:border-violet-900 dark:text-violet-100/80">
          {text}
        </pre>
      )}
    </div>
  )
}
