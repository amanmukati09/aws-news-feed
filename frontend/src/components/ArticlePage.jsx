import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { getArticle, downloadInfographic } from '../api/client'
import { useArticleSummary } from '../hooks/useArticleSummary'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useDarkMode } from '../hooks/useDarkMode'
import { categoryMeta } from '../lib/categories'
import { fmtDate, readingTime } from '../lib/format'

function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className + ' animate-spin'}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

export default function ArticlePage() {
  const { id } = useParams()
  const [dark, setDark] = useDarkMode()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pdfState, setPdfState] = useState('idle')
  const [copied, setCopied] = useState(false)
  const [bookmarks, setBookmarks] = useLocalStorage('awsnews.bookmarks', [])
  const [showSummary, setShowSummary] = useState(false)

  const summary = useArticleSummary(id)
  const bookmarked = bookmarks.includes(id)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    getArticle(id)
      .then((d) => { if (alive) setArticle(d) })
      .catch((e) => { if (alive) setError(e?.response?.data?.error || e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [id])

  useEffect(() => {
    if (article?.title) document.title = `${article.title} · AWS News`
  }, [article])

  const meta = useMemo(() => categoryMeta(article?.category), [article])

  function toggleBookmark() {
    setBookmarks((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(article?.link || window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* ignore */ }
  }

  async function share() {
    if (navigator.share) {
      try { await navigator.share({ title: article?.title, url: article?.link }) } catch { /* ignore */ }
    } else {
      copyLink()
    }
  }

  async function handleDownload() {
    if (pdfState === 'loading') return
    setPdfState('loading')
    try {
      await downloadInfographic({ id, title: article?.title })
      setPdfState('idle')
    } catch {
      setPdfState('error')
      setTimeout(() => setPdfState('idle'), 2500)
    }
  }

  function openSummary() {
    setShowSummary(true)
    if (!summary.started) summary.run()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 text-slate-900 dark:from-[#0a0f1e] dark:via-[#0a1220] dark:to-[#0a1628] dark:text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-[#0a0f1e]/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-brand-600 dark:text-slate-300 dark:hover:text-brand-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to feed
          </Link>
          <button
            type="button"
            onClick={() => setDark(!dark)}
            aria-label="Toggle theme"
            className="grid h-8 w-8 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {dark ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {loading && (
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-24 rounded-full bg-slate-200 dark:bg-slate-800" />
            <div className="h-9 w-5/6 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-56 w-full rounded-2xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-full rounded bg-slate-100 dark:bg-slate-800/60" />
            <div className="h-4 w-11/12 rounded bg-slate-100 dark:bg-slate-800/60" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/30">
            <p className="font-medium text-red-800 dark:text-red-300">Couldn’t load this article</p>
            <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>
            <Link to="/" className="mt-3 inline-block rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Back to feed</Link>
          </div>
        )}

        {article && !loading && (
          <article>
            {/* meta */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium ring-1 ring-inset ${meta.pill}`}>
                {article.category}
              </span>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">{article.source}</span>
              <span className="text-slate-400">·</span>
              <time className="text-slate-500 dark:text-slate-400">{fmtDate(article.published, 'long')}</time>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500 dark:text-slate-400">{readingTime(article.full_text)}</span>
              {!article.scraped && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  summary only
                </span>
              )}
            </div>

            {/* title */}
            <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              {article.title}
            </h1>

            {/* action row */}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openSummary}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-aws-orange to-orange-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M12 3v3M5.6 5.6l2.1 2.1M3 12h3M18 12h3M16.3 7.7l2.1-2.1M12 18v3M7.7 16.3l-2.1 2.1M16.3 16.3l2.1 2.1" /><circle cx="12" cy="12" r="3" /></svg>
                AI Summary
              </button>

              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                Read on AWS
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M7 17 17 7M7 7h10v10" /></svg>
              </a>

              <button type="button" onClick={handleDownload} disabled={pdfState === 'loading'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {pdfState === 'loading' ? <Spinner /> : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
                )}
                {pdfState === 'loading' ? 'Generating…' : pdfState === 'error' ? 'Retry PDF' : 'Infographic PDF'}
              </button>

              <button type="button" onClick={toggleBookmark} aria-label="Bookmark"
                className={'grid h-9 w-9 place-items-center rounded-lg border transition ' + (bookmarked ? 'border-aws-orange/50 bg-orange-50 text-aws-orange dark:bg-orange-950/40' : 'border-slate-300 bg-white text-slate-500 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400')}>
                <svg viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
              </button>

              <button type="button" onClick={share} aria-label="Share"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-500 transition hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" /></svg>
              </button>

              <button type="button" onClick={copyLink} aria-label="Copy link"
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-300 bg-white text-slate-500 transition hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                {copied ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-emerald-500"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                )}
              </button>
            </div>

            {/* AI summary panel */}
            {showSummary && (
              <section className="mt-6 overflow-hidden rounded-2xl border border-aws-orange/30 bg-orange-50/40 dark:border-aws-orange/20 dark:bg-orange-950/10">
                <div className="flex items-center justify-between border-b border-aws-orange/20 px-4 py-2.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-aws-orange">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>
                    AI Summary {summary.streaming && <Spinner className="h-3.5 w-3.5" />}
                  </div>
                  {summary.streaming && (
                    <button onClick={summary.stop} className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400">Stop</button>
                  )}
                </div>

                <div className="px-4 py-4">
                  {summary.toolCalls.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {summary.toolCalls.filter((t) => t.kind === 'tool_call').map((t, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                          🔧 {t.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {summary.error && (
                    <p className="text-sm text-red-600 dark:text-red-400">{summary.error}</p>
                  )}

                  {!summary.text && summary.streaming && !summary.error && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Analysing the article…</p>
                  )}

                  <div className="prose-article text-[15px] text-slate-700 dark:text-slate-300">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary.text}</ReactMarkdown>
                  </div>

                  {summary.sources.length > 0 && (
                    <div className="mt-4 border-t border-aws-orange/20 pt-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Related</p>
                      <ul className="space-y-1">
                        {summary.sources.map((s) => (
                          <li key={s.id}>
                            <Link to={`/news/${s.id}`} className="text-sm text-brand-600 hover:underline dark:text-brand-300">{s.title}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* hero */}
            {article.hero && (
              <img
                src={article.hero}
                alt=""
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
                className="mt-6 w-full rounded-2xl border border-slate-200 object-cover dark:border-slate-800"
              />
            )}

            {/* full scraped content */}
            <div className="mt-6 space-y-4">
              {article.blocks && article.blocks.length > 0 ? (
                article.blocks.map((b, i) => {
                  if (b.type === 'heading') {
                    return (
                      <h2 key={i} className="relative mt-2 pt-2 pl-3 text-lg font-bold text-brand-700 dark:text-brand-300">
                        <span className="absolute left-0 top-2 bottom-1 w-1 rounded bg-gradient-to-b from-aws-orange to-orange-600" />
                        {b.text}
                      </h2>
                    )
                  }
                  if (b.type === 'list') {
                    return (
                      <div key={i} className="flex gap-2 pl-1 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-aws-orange" />
                        <span>{b.text}</span>
                      </div>
                    )
                  }
                  return <p key={i} className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{b.text}</p>
                })
              ) : (
                <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {article.full_text || 'No additional content available. Use “Read on AWS” for the full article.'}
                </p>
              )}
            </div>

            {/* gallery (extra images beyond hero) */}
            {article.images && article.images.length > 1 && (
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {article.images.slice(1, 7).map((src, i) => (
                  <img key={i} src={src} alt="" loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                    className="h-28 w-full rounded-lg border border-slate-200 object-cover dark:border-slate-800" />
                ))}
              </div>
            )}

            {/* bottom read-on-aws */}
            <div className="mt-10 border-t border-slate-200 pt-6 dark:border-slate-800">
              <a href={article.link} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300">
                Read the full announcement on AWS
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M7 17 17 7M7 7h10v10" /></svg>
              </a>
            </div>
          </article>
        )}
      </main>
    </div>
  )
}
