function groupSessions(sessions) {
  const now = Date.now()
  const day = 86400000
  const groups = { Today: [], Yesterday: [], 'This week': [], Older: [] }
  for (const s of sessions) {
    const age = now - (s.updatedAt || s.createdAt || now)
    if (age < day) groups.Today.push(s)
    else if (age < 2 * day) groups.Yesterday.push(s)
    else if (age < 7 * day) groups['This week'].push(s)
    else groups.Older.push(s)
  }
  return groups
}

export default function ChatSidebar({
  sessions, activeId, onSelect, onNew, onRemove, onClearAll, open, onClose,
}) {
  const groups = groupSessions(sessions)
  const total = sessions.length

  return (
    <>
      {open && (
        <div
          className="absolute inset-0 z-10 bg-slate-900/40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={
          'absolute left-0 top-0 z-20 flex h-full w-64 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-[#0a0f1e] ' +
          (open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:static lg:z-auto')
        }
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Chats · {total}
          </h3>
          <button
            type="button"
            onClick={onNew}
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-3 w-3">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {total === 0 && (
            <p className="px-2 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
              No chats yet. Ask something to start.
            </p>
          )}

          {Object.entries(groups).map(([label, list]) =>
            list.length === 0 ? null : (
              <div key={label} className="mb-3">
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {label}
                </p>
                <ul className="space-y-0.5">
                  {list.map((s) => (
                    <li key={s.id}>
                      <div
                        className={
                          'group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs ' +
                          (s.id === activeId
                            ? 'bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100'
                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')
                        }
                      >
                        <button
                          type="button"
                          onClick={() => onSelect(s.id)}
                          className="min-w-0 flex-1 truncate text-left"
                        >
                          {s.title || 'New chat'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(s.id)}
                          aria-label="Delete chat"
                          className="grid h-5 w-5 place-items-center rounded text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-200 hover:text-red-600 dark:hover:bg-slate-700"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-3 w-3">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>

        {total > 0 && (
          <div className="border-t border-slate-200 p-2 dark:border-slate-800">
            <button
              type="button"
              onClick={onClearAll}
              className="w-full rounded-md px-2 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Clear all chats
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
