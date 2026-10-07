import { useState } from 'react'

const ICONS = {
  tool_call: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
  tool_result: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
}

export default function ToolCallCard({ entry }) {
  const [open, setOpen] = useState(false)
  const isResult = entry.kind === 'tool_result'
  const name = entry.name || entry.tool || 'tool'
  const args = entry.args || entry.arguments || entry.input

  return (
    <div className={
      'rounded-lg border text-xs ' +
      (isResult
        ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30'
        : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60')
    }>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        <span className={
          'grid h-5 w-5 place-items-center rounded-md text-white ' +
          (isResult ? 'bg-emerald-500' : 'bg-slate-500 dark:bg-slate-600')
        }>
          {ICONS[entry.kind] || ICONS.tool_call}
        </span>
        <span className="font-mono text-[11px] font-medium text-slate-700 dark:text-slate-200">
          {isResult ? 'result · ' : 'call · '}{name}
        </span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={'ml-auto h-3 w-3 text-slate-400 transition-transform ' + (open ? 'rotate-90' : '')}
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>

      {open && (args || entry.result) && (
        <div className="border-t border-inherit px-2.5 py-2">
          {args && (
            <>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Arguments
              </p>
              <pre className="max-h-40 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-100">
                {typeof args === 'string' ? args : JSON.stringify(args, null, 2)}
              </pre>
            </>
          )}
          {entry.result && (
            <>
              <p className="mt-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Result
              </p>
              <pre className="max-h-40 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-100">
                {typeof entry.result === 'string' ? entry.result : JSON.stringify(entry.result, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}
