export function fmtDate(iso, style = 'short') {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (style === 'long') {
      return d.toLocaleDateString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    }
    if (style === 'relative') {
      const s = Math.round((Date.now() - d.getTime()) / 1000)
      if (s < 60) return 'just now'
      if (s < 3600) return `${Math.round(s / 60)}m ago`
      if (s < 86400) return `${Math.round(s / 3600)}h ago`
      if (s < 604800) return `${Math.round(s / 86400)}d ago`
    }
    return d.toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  } catch {
    return ''
  }
}

export function readingTime(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length
  const mins = Math.max(1, Math.round(words / 60))
  return `${mins} min read`
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function daysAgoISO(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
}
