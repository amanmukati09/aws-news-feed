import { useEffect, useRef, useState } from 'react'

const QUICK_ACTIONS = [
  { icon: '📄', label: 'Top 5 PDF', prompt: 'Give me a PDF of the top 5 updates with their summaries.' },
  { icon: '🗓️', label: 'Weekly digest', prompt: 'Create the weekly digest PDF — this week in AWS.' },
  { icon: '⚖️', label: 'Compare', prompt: 'Compare the two most recent Bedrock model launches as a PDF.' },
  { icon: '🤖', label: 'AI/ML news', prompt: 'What are the latest AI/ML announcements?' },
  { icon: '⚡', label: 'EC2 / Compute', prompt: 'Any recent EC2 or compute announcements?' },
  { icon: '🔐', label: 'Security', prompt: 'What security features launched recently?' },
]

export default function ChatInput({ onSend, onStop, busy, disabled }) {
  const [value, setValue] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!busy) ref.current?.focus()
  }, [busy])

  function submit() {
    const v = value.trim()
    if (!v || busy) return
    onSend(v)
    setValue('')
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="border-t border-slate-200 p-3 dark:border-slate-800">
      {/* Quick actions — one-tap preset prompts (great for demos / managers) */}
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => !busy && onSend(a.prompt)}
            disabled={busy}
            title={a.prompt}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-aws-orange/50 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-aws-orange/40 dark:hover:bg-orange-950/30"
          >
            <span aria-hidden="true">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask about AWS news…  (Enter to send, Shift+Enter for newline)"
          rows={1}
          disabled={disabled}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:bg-white disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-600"
        />

        {busy && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy || !value.trim()}
            aria-label="Send"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-aws-orange to-orange-500 text-white shadow-md shadow-orange-500/25 transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="m22 2-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        )}
      </div>
      <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
        Grounded in the live feed · not affiliated with AWS
      </p>
    </div>
  )
}
