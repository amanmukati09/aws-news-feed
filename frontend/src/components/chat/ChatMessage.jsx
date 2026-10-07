import { useState } from 'react'
import ChatMarkdown from './ChatMarkdown'
import SourceCards from './SourceCards'
import ToolCallCard from './ToolCallCard'
import ReasoningBlock from './ReasoningBlock'

function Avatar({ role, streaming }) {
  const isUser = role === 'user'
  return (
    <div className={
      'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ' +
      (isUser
        ? 'bg-brand-500'
        : 'bg-gradient-to-br from-aws-orange to-orange-500 ' +
          (streaming ? 'ring-2 ring-aws-orange/40 ring-offset-2 ring-offset-transparent animate-pulse' : ''))
    }>
      {isUser ? 'U' : 'AI'}
    </div>
  )
}

function Action({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {children}
    </button>
  )
}

/**
 * Collapsible group of tool calls.
 * - While streaming: expanded, so the user sees activity happening.
 * - After streaming: collapsed to a single summary line.
 * - Click to expand/collapse manually.
 */
function ToolGroup({ toolCalls, streaming }) {
  // Default: open while streaming, closed after — but let user override
  const [manual, setManual] = useState(null)
  const open = manual === null ? !!streaming : manual

  if (!toolCalls?.length) return null

  // Summarize: unique names + counts
  const callNames = toolCalls
    .filter((t) => t.kind === 'tool_call')
    .map((t) => t.name)
    .filter(Boolean)
  const unique = Array.from(new Set(callNames))
  const summary = unique.length
    ? `${unique.join(', ')}${callNames.length > unique.length ? ` ×${callNames.length}` : ''}`
    : 'tools'

  return (
    <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40">
      <button
        type="button"
        onClick={() => setManual(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs"
      >
        <span className="grid h-5 w-5 place-items-center rounded-md bg-slate-500 text-white dark:bg-slate-600">
          {streaming ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-3 w-3 animate-spin">
              <path d="M21 12a9 9 0 1 1-6.2-8.5" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </span>
        <span className="font-medium text-slate-700 dark:text-slate-200">
          {streaming ? 'Calling tools…' : `Used ${callNames.length || 'tools'}`}
        </span>
        <span className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
          {summary}
        </span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={'ml-auto h-3 w-3 text-slate-400 transition-transform ' + (open ? 'rotate-90' : '')}
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>

      {open && (
        <div className="space-y-1.5 border-t border-slate-200 px-2.5 py-2 dark:border-slate-800">
          {toolCalls.map((t, i) => <ToolCallCard key={i} entry={t} />)}
        </div>
      )}
    </div>
  )
}

export default function ChatMessage({ message, onRegenerate, onFeedback }) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {}
  }

  return (
    <div className={'group flex gap-2.5 ' + (isUser ? 'flex-row-reverse' : '')}>
      <Avatar role={message.role} streaming={message.streaming} />

      <div className={'min-w-0 max-w-[88%] ' + (isUser ? 'items-end' : 'items-start')}>
        {!isUser && message.reasoning && (
          <ReasoningBlock text={message.reasoning} streaming={message.streaming} />
        )}

        {!isUser && message.toolCalls?.length > 0 && (
          <ToolGroup toolCalls={message.toolCalls} streaming={message.streaming} />
        )}

        <div className={
          'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ' +
          (isUser
            ? 'bg-brand-500 text-white'
            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100')
        }>
          {message.streaming && !message.content && !isUser ? (
            <span className="inline-flex items-center">
              <span className="chat-dot" />
              <span className="chat-dot" />
              <span className="chat-dot" />
            </span>
          ) : isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <ChatMarkdown>{message.content || ''}</ChatMarkdown>
          )}

          {!isUser && message.sources?.length > 0 && !message.streaming && (
            <SourceCards sources={message.sources} />
          )}
        </div>

        {!isUser && !message.streaming && message.content && (
          <div className="mt-1 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <Action label={copied ? 'Copied' : 'Copy'} onClick={copy}>
              {copied ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-3.5 w-3.5 text-emerald-500">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </Action>

            {onRegenerate && (
              <Action label="Regenerate" onClick={onRegenerate}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M21 12a9 9 0 1 1-6.2-8.5" />
                  <path d="M21 3v6h-6" />
                </svg>
              </Action>
            )}

            {onFeedback && (
              <>
                <Action label="Good answer" onClick={() => onFeedback('up')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
                  </svg>
                </Action>
                <Action label="Bad answer" onClick={() => onFeedback('down')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
                  </svg>
                </Action>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}