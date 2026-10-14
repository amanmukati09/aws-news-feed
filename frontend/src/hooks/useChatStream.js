import { useCallback, useRef, useState } from 'react'

/**
 * Defensive strip of chain-of-thought tags that may slip through the token
 * channel. Removes complete <thinking>…</thinking> blocks and hides a trailing
 * unclosed opener so partial tags don't flash while streaming.
 */
export function stripThinking(s) {
  if (!s) return s
  let out = s.replace(/<\s*(thinking|think|reasoning|thought)\s*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  // drop a trailing, not-yet-closed opener (still streaming)
  out = out.replace(/<\s*(thinking|think|reasoning|thought)\s*>[\s\S]*$/i, '')
  // strip any stray standalone tags
  out = out.replace(/<\s*\/?\s*(thinking|think|reasoning|thought)\s*>/gi, '')
  return out
}

/**
 * POST to /api/chat/stream and parse SSE frames.
 * Returns { text, sources, toolCalls, reasoning, streaming, error, send, stop }
 */
export function useChatStream() {
  const [text, setText] = useState('')
  const [sources, setSources] = useState([])
  const [toolCalls, setToolCalls] = useState([])
  const [reasoning, setReasoning] = useState('')
  const [artifacts, setArtifacts] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }, [])

  const send = useCallback(async (question, history = []) => {
    setText(''); setSources([]); setToolCalls([]); setReasoning(''); setArtifacts([]); setError(null)
    setStreaming(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
        signal: ctrl.signal,
      })
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${body}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // SSE frame parser
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let idx
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)

          let event = 'message'
          let dataLine = ''
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLine += line.slice(5).trim()
          }
          if (!dataLine) continue
          let payload
          try { payload = JSON.parse(dataLine) } catch { continue }

          if (event === 'token') setText((t) => stripThinking(t + (payload.text || '')))
          else if (event === 'sources') setSources(payload.sources || [])
          else if (event === 'reasoning') setReasoning((r) => r + (payload.text || ''))
          else if (event === 'tool_call' || event === 'tool_result') {
            setToolCalls((prev) => [...prev, { kind: event, ...payload.tool }])
          } else if (event === 'artifact') {
            setArtifacts((prev) => [...prev, payload.artifact])
          } else if (event === 'error') setError(payload.message || 'stream error')
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [])

  return { text, sources, toolCalls, reasoning, artifacts, streaming, error, send, stop }
}
