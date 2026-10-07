const SUGGESTIONS = [
  { icon: '🔎', label: 'What’s new with Bedrock?' },
  { icon: '⚡', label: 'Any recent EC2 announcements?' },
  { icon: '🗄️', label: 'Show me database updates' },
  { icon: '🔐', label: 'What security features launched recently?' },
  { icon: '🤖', label: 'Summarize this week’s AI/ML releases' },
  { icon: '💡', label: 'Which service got the most updates?' },
]

export default function ChatWelcome({ onPick }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-900/50">
      <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-aws-orange to-orange-500 text-white shadow-md shadow-orange-500/25">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
          <circle cx="12" cy="12" r="3.5" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        Ask anything about recent AWS news
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Answers are grounded in the live feed, with citations. Supports multi-turn.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-1.5 text-left sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s.label)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-700 dark:hover:bg-brand-700/20"
          >
            <span aria-hidden="true">{s.icon}</span>
            <span className="truncate">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
