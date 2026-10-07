import { Fragment } from 'react'

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function Highlight({ text, query }) {
  if (!query || !text) return text
  const q = query.trim()
  if (q.length < 2) return text

  try {
    const parts = text.split(new RegExp(`(${escapeRegex(q)})`, 'gi'))
    return (
      <>
        {parts.map((p, i) =>
          p.toLowerCase() === q.toLowerCase() ? (
            <mark key={i}>{p}</mark>
          ) : (
            <Fragment key={i}>{p}</Fragment>
          )
        )}
      </>
    )
  } catch {
    return text
  }
}
