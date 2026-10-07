import { useEffect, useMemo, useRef, useState } from 'react'
import { useChatStream } from '../hooks/useChatStream'
import { useChatSessions } from '../hooks/useChatSessions'
import ChatMessage from './chat/ChatMessage'
import ChatSidebar from './chat/ChatSidebar'
import ChatInput from './chat/ChatInput'
import ChatWelcome from './chat/ChatWelcome'

export default function ChatDrawer({ open, onClose }) {
  const {
    sessions, activeId, active,
    create, remove, clearAll,
    appendMessage, updateLastAssistant, dropLast, setActiveId,
  } = useChatSessions()

  const { text, sources, toolCalls, reasoning, streaming, error, send, stop } =
    useChatStream()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const scrollRef = useRef(null)

  // Auto-scroll while streaming
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [text, toolCalls, reasoning, streaming, active?.messages?.length])

  // Persist streaming content into the active session as it arrives
  useEffect(() => {
    if (!activeId || !streaming) return
    updateLastAssistant(activeId, {
      content: text,
      sources,
      toolCalls,
      reasoning,
      streaming: true,
    })
  }, [activeId, streaming, text, sources, toolCalls, reasoning, updateLastAssistant])

  // Mark streaming finished
  useEffect(() => {
    if (!activeId) return
    if (!streaming) {
      updateLastAssistant(activeId, { streaming: false })
    }
  }, [activeId, streaming, updateLastAssistant])

  async function handleSend(question) {
    let sid = activeId
    if (!sid) sid = create()

    appendMessage(sid, { role: 'user', content: question })
    appendMessage(sid, {
      role: 'assistant',
      content: '',
      sources: [],
      toolCalls: [],
      reasoning: '',
      streaming: true,
    })

    const history = (sessions.find((s) => s.id === sid)?.messages || [])
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }))

    await send(question, history)
  }

  async function handleRegenerate() {
    if (!activeId || streaming) return
    const msgs = active?.messages || []
    let lastUser = null
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUser = msgs[i]; break }
    }
    if (!lastUser) return

    // remove the last (assistant) message, then push a fresh placeholder
    dropLast(activeId)
    appendMessage(activeId, {
      role: 'assistant',
      content: '',
      sources: [],
      toolCalls: [],
      reasoning: '',
      streaming: true,
    })

    const history = msgs
      .slice(0, -1)
      .filter((m) => !m.streaming)
      .map((m) => ({ role: m.role, content: m.content }))

    await send(lastUser.content, history)
  }

  const messages = useMemo(() => active?.messages || [], [active])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI assistant"
      className="fixed inset-0 z-40"
    >
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      <aside
        className="absolute right-0 top-0 flex h-full w-full max-w-3xl border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0a0f1e]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Desktop sessions sidebar */}
        <div className="relative hidden lg:block">
          <ChatSidebar
            sessions={sessions}
            activeId={activeId}
            onSelect={(id) => { setActiveId(id); setSidebarOpen(false) }}
            onNew={() => { create(); setSidebarOpen(false) }}
            onRemove={remove}
            onClearAll={clearAll}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        </div>

        {/* Mobile sessions overlay */}
        {sidebarOpen && (
          <div className="absolute inset-0 z-30 lg:hidden">
            <ChatSidebar
              sessions={sessions}
              activeId={activeId}
              onSelect={(id) => { setActiveId(id); setSidebarOpen(false) }}
              onNew={() => { create(); setSidebarOpen(false) }}
              onRemove={remove}
              onClearAll={clearAll}
              open
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        )}

        {/* Right: conversation column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open chats"
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>

            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-aws-orange to-orange-500 text-white shadow-md shadow-orange-500/25">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
                <circle cx="12" cy="12" r="3.5" />
              </svg>
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {active?.title || 'AWS News AI'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Grounded answers · cited sources
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 && <ChatWelcome onPick={handleSend} />}

            {messages.map((m, i) => (
              <ChatMessage
                key={i}
                message={m}
                onRegenerate={
                  m.role === 'assistant' && i === messages.length - 1 && !streaming
                    ? handleRegenerate
                    : undefined
                }
                onFeedback={() => {}}
              />
            ))}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          <ChatInput onSend={handleSend} onStop={stop} busy={streaming} />
        </div>
      </aside>
    </div>
  )
}