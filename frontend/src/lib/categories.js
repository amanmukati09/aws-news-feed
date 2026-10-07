export const CATEGORY_META = {
  'AI/ML':     { pill: 'bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:ring-purple-900',   dot: 'bg-purple-500' },
  Compute:     { pill: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-900',               dot: 'bg-blue-500' },
  Database:    { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900', dot: 'bg-emerald-500' },
  Security:    { pill: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900',                     dot: 'bg-red-500' },
  Storage:     { pill: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900',         dot: 'bg-amber-500' },
  Networking:  { pill: 'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:ring-cyan-900',               dot: 'bg-cyan-500' },
  Analytics:   { pill: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-900',   dot: 'bg-indigo-500' },
  'Dev Tools': { pill: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',           dot: 'bg-slate-500' },
  Containers:  { pill: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-900',               dot: 'bg-teal-500' },
  Management:  { pill: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-900',   dot: 'bg-orange-500' },
  General:     { pill: 'bg-gray-50 text-gray-700 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',               dot: 'bg-gray-400' },
}

export const FALLBACK_META = CATEGORY_META.General

export function categoryMeta(name) {
  return CATEGORY_META[name] || FALLBACK_META
}
