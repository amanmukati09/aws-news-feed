export default function ChatButton({ onClick, open, unread }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
      aria-pressed={open}
      className="fixed bottom-6 left-6 z-40 flex h-12 items-center gap-2 rounded-full bg-gradient-to-br from-aws-orange to-orange-500 px-4 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
    >
      {open ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-5 w-5">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      )}
      <span className="hidden sm:inline">Ask AI</span>
      {unread > 0 && !open && (
        <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-orange-500">
          {unread}
        </span>
      )}
    </button>
  )
}
