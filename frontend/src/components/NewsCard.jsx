import { useMemo, useState } from 'react'
import { categoryMeta } from '../lib/categories'
import { fmtDate, readingTime } from '../lib/format'
import { Highlight } from '../lib/highlight'

const SOURCE_AVATAR = {
  'whats-new':    { bg: 'bg-aws-orange',  label: 'W' },
  'news-blog':    { bg: 'bg-blue-500',    label: 'N' },
  'ml-blog':      { bg: 'bg-purple-500',  label: 'M' },
  'compute-blog': { bg: 'bg-emerald-500', label: 'C' },
}

const TOPIC_STOP = new Set([
  'the','a','an','and','or','but','of','to','in','on','for','with','at','by','from',
  'is','are','was','were','be','been','has','have','had','do','does','did','will',
  'you','your','we','our','us','it','its','this','that','these','those','as','if',
  'new','now','aws','amazon','announcing','introducing','launch','launches',
  'available','generally','updates','update','supports','support','feature',
  'using','use','get','getting','start','started','based','more','less','most',
  'very','all','any','some','than','then','into','also','no','not','yes','can',
  'could','should','would','may','might','per','via','about','across','between',
])

function isRecent(iso, hours = 24) {
  if (!iso) return false
  const t = new Date(iso).getTime()
  if (isNaN(t)) return false
  return Date.now() - t < hours * 3600_000
}

function extractTopics(title, summary, limit = 3) {
  const text = `${title || ''} ${summary || ''}`.toLowerCase()
  const counts = new Map()
  for (const w of text.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)) {
    if (w.length < 4 || TOPIC_STOP.has(w) || /^\d+$/.test(w)) continue
    counts.set(w, (counts.get(w) || 0) + 1)
  }
  // Rank by length (longer words tend to be more specific) then frequency
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([w]) => w)
}

function ShareMenu({ open, onClose, link, title }) {
  if (!open) return null
  const enc = encodeURIComponent
  const items = [
    {
      label: 'Copy link',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      ),
      href: null,
      action: 'copy',
    },
    {
      label: 'Share on X',
      icon: <span className="text-[11px] font-bold">𝕏</span>,
      href: `https://twitter.com/intent/tweet?text=${enc(title)}&url=${enc(link)}`,
    },
    {
      label: 'LinkedIn',
      icon: <span className="text-[11px] font-bold">in</span>,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(link)}`,
    },
  ]
  return (
    <div
      className="absolute right-0 top-8 z-30 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      onMouseLeave={onClose}
    >
      {items.map((it) => (
        <a
          key={it.label}
          href={it.href || '#'}
          target={it.href ? '_blank' : undefined}
          rel={it.href ? 'noopener noreferrer' : undefined}
          onClick={(e) => {
            if (it.action === 'copy') {
              e.preventDefault()
              navigator.clipboard?.writeText(link).catch(() => {})
            }
            onClose()
          }}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <span className="grid h-4 w-4 place-items-center text-slate-500 dark:text-slate-400">
            {it.icon}
          </span>
          {it.label}
        </a>
      ))}
    </div>
  )
}

function ActionBtn({ label, onClick, active, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        'grid h-7 w-7 place-items-center rounded-md transition ' +
        (active
          ? 'bg-orange-50 text-aws-orange dark:bg-orange-950/40'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100') +
        ' ' + className
      }
    >
      {children}
    </button>
  )
}

export default function NewsCard({
  item,
  query,
  compact,
  bookmarked,
  onToggleBookmark,
  onTopicClick,
}) {
  const [copied, setCopied] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const meta = categoryMeta(item.category)
  const avatar = SOURCE_AVATAR[item.source] || { bg: 'bg-slate-500', label: (item.source || '?')[0]?.toUpperCase() }
  const rt = readingTime(`${item.title} ${item.summary}`)
  const fresh = isRecent(item.published, 24)
  const topics = useMemo(
    () => extractTopics(item.title, item.summary, 3),
    [item.title, item.summary]
  )

  function handleBookmark(e) {
    e.preventDefault()
    e.stopPropagation()
    onToggleBookmark?.(item.id)
  }

  async function copyLink(e) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(item.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = item.link
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    }
  }

  async function nativeShare(e) {
    e.preventDefault()
    e.stopPropagation()
    if (navigator.share) {
      try { await navigator.share({ title: item.title, url: item.link }) } catch {}
    } else {
      setShareOpen((o) => !o)
    }
  }

  return (
    <article
      className={
        'group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ' +
        'dark:bg-[#0f172a] ' +
        (fresh
          ? 'border-aws-orange/40 hover:border-aws-orange/70 dark:border-aws-orange/30'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700') +
        ' ' + (compact ? 'p-3.5' : 'p-5')
      }
    >
      {/* Whole-card link — bottom layer */}
      <a
        href={item.link}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={item.title}
        className="absolute inset-0 z-0 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <span className="sr-only">{item.title}</span>
      </a>

      {/* Meta row + actions */}
      <div className="relative z-10 flex flex-wrap items-center gap-2 text-xs">
        {/* Source avatar */}
        <span
          className={'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white ' + avatar.bg}
          title={item.source}
        >
          {avatar.label}
        </span>

        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium ring-1 ring-inset ${meta.pill}`}>
          {item.category}
        </span>

        {fresh && (
          <span className="inline-flex items-center gap-1 rounded-full bg-aws-orange/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-aws-orange">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aws-orange opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-aws-orange" />
            </span>
            New
          </span>
        )}

        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
          {item.source}
        </span>

        <time
          className="text-slate-500 dark:text-slate-400"
          dateTime={item.published || ''}
          title={item.published ? new Date(item.published).toLocaleString() : ''}
        >
          {fmtDate(item.published)}
        </time>

        {!compact && (
          <>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="text-slate-500 dark:text-slate-400">{rt}</span>
          </>
        )}

        {/* Actions: bookmark, share, copy */}
        <div className="relative ml-auto flex items-center gap-0.5 opacity-60 transition group-hover:opacity-100 focus-within:opacity-100">
          <ActionBtn
            label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
            active={bookmarked}
            onClick={handleBookmark}
          >
            <svg viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </ActionBtn>

          <ActionBtn label="Share" onClick={nativeShare}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" />
            </svg>
          </ActionBtn>

          <ActionBtn label={copied ? 'Link copied' : 'Copy link'} onClick={copyLink}>
            {copied ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-emerald-500">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </ActionBtn>

          <ShareMenu
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            link={item.link}
            title={item.title}
          />
        </div>
      </div>

      {/* Title */}
      <h2 className={`pointer-events-none relative mt-3 font-semibold leading-snug text-slate-900 dark:text-slate-100 group-hover:text-brand-700 dark:group-hover:text-brand-300 ${compact ? 'text-sm sm:text-base' : 'text-base sm:text-lg'}`}>
        <Highlight text={item.title} query={query} />
      </h2>

      {/* Summary */}
      {!compact && (
        <p className="pointer-events-none relative mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          <Highlight text={item.summary} query={query} />
        </p>
      )}

      {/* Topic chips (only when not compact) */}
      {!compact && topics.length > 0 && onTopicClick && (
        <div className="pointer-events-none relative mt-3 flex flex-wrap gap-1.5">
          {topics.map((t) => (
            <button
              key={t}
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onTopicClick(t)
              }}
              className="pointer-events-auto rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-brand-700 dark:hover:bg-brand-700/20 dark:hover:text-brand-300"
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* Bottom CTA */}
      <div className={`pointer-events-none relative flex items-center gap-1 font-medium text-brand-600 transition group-hover:text-brand-700 dark:text-brand-300 dark:group-hover:text-brand-200 ${compact ? 'mt-2 text-xs' : 'mt-3 text-sm'}`}>
        Read on AWS
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-hover:translate-x-0.5">
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </div>
    </article>
  )
}