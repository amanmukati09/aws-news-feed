const HOW_IT_WORKS = [
  {
    title: 'Aggregated',
    text: 'Four official AWS RSS feeds fetched server-side on a TTL cache.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M4 11a9 9 0 0 1 9 9" />
        <path d="M4 4a16 16 0 0 1 16 16" />
        <circle cx="5" cy="19" r="1" />
      </svg>
    ),
  },
  {
    title: 'Ranked',
    text: 'BM25 lexical search over the in-memory corpus — no embeddings, no DB.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M3 3v18h18" />
        <path d="M7 14l4-4 3 3 5-5" />
      </svg>
    ),
  },
  {
    title: 'Grounded',
    text: 'The AI answers only from retrieved items and cites every source it uses.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
]

const STACK = [
  { label: 'React 18',          href: 'https://react.dev' },
  { label: 'Vite',              href: 'https://vitejs.dev' },
  { label: 'Tailwind v4',       href: 'https://tailwindcss.com' },
  { label: 'Flask',             href: 'https://flask.palletsprojects.com' },
  { label: 'feedparser',        href: 'https://feedparser.readthedocs.io' },
  { label: 'BM25 retrieval',    href: 'https://en.wikipedia.org/wiki/Okapi_BM25' },
  { label: 'Groq · gpt-oss',    href: 'https://groq.com' },
  { label: 'AWS Bedrock ready', href: 'https://aws.amazon.com/bedrock/' },
]

function StatsBlock({ stats }) {
  const items = [
    { label: 'Articles',   value: stats?.total ?? '—' },
    { label: 'Sources',    value: stats?.sources ?? '—' },
    { label: 'Categories', value: stats?.categories ?? '—' },
    { label: 'Last sync',  value: stats?.lastSync || '—' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-xl border border-slate-200 bg-white/70 p-3 text-center backdrop-blur dark:border-slate-800 dark:bg-slate-900/60"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {it.label}
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {it.value}
          </p>
        </div>
      ))}
    </div>
  )
}

function HowItWorks() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        How it works
      </h3>
      <ul className="mt-3 space-y-3">
        {HOW_IT_WORKS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {step.icon}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                <span className="mr-1 text-slate-400 dark:text-slate-500">{i + 1}.</span>
                {step.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function BuiltWith() {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Built with
      </h3>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {STACK.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand-700 dark:hover:bg-brand-700/20 dark:hover:text-brand-300"
          >
            {s.label}
          </a>
        ))}
      </div>
    </div>
  )
}

export default function Footer({ stats }) {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white/60 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">

        {/* Live stats strip */}
        <StatsBlock stats={stats} />

        {/* Main grid */}
        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          {/* Brand */}
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-aws-orange to-orange-500 shadow-md shadow-orange-500/25">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M3 15a4 4 0 004 4h10a4 4 0 100-8 6 6 0 00-11.5-2A4 4 0 003 15z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  AWS News Dashboard
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Grounded in official RSS feeds
                </p>
              </div>
            </div>

            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              A fast, self-contained newsreader for AWS announcements. Filters,
              bookmarks, dark mode, and a grounded AI assistant — all running
              locally, no account required.
            </p>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <a
                href="https://aws.amazon.com/blogs/aws/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-700 dark:hover:bg-brand-700/20"
              >
                AWS Blog ↗
              </a>
              <a
                href="https://aws.amazon.com/about-aws/whats-new/recent/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-700 dark:hover:bg-brand-700/20"
              >
                What’s New ↗
              </a>
              <a
                href="https://docs.aws.amazon.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-700 dark:hover:bg-brand-700/20"
              >
                Docs ↗
              </a>
            </div>
          </div>

          {/* How it works */}
          <div className="lg:col-span-4">
            <HowItWorks />
          </div>

          {/* Built with */}
          <div className="lg:col-span-3">
            <BuiltWith />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500 sm:flex-row sm:items-center dark:border-slate-800 dark:text-slate-400">
          <p>
            © {new Date().getFullYear()} AWS News Dashboard · Unofficial community project · Not affiliated with Amazon Web Services.
          </p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Operational
            </span>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300"
            >
              Back to top ↑
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}