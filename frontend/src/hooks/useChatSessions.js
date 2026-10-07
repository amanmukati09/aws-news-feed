import { useCallback, useMemo } from 'react'
import { useLocalStorage } from './useLocalStorage'

const MAX_SESSIONS = 30

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

function titleFrom(text) {
  if (!text) return 'New chat'
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > 40 ? t.slice(0, 40) + '…' : t
}

export function useChatSessions() {
  const [sessions, setSessions] = useLocalStorage('awsnews.sessions', [])
  const [activeId, setActiveId] = useLocalStorage('awsnews.session.active', null)

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) || null,
    [sessions, activeId]
  )

  const create = useCallback(() => {
    const s = {
      id: uid(),
      title: 'New chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setSessions((prev) => [s, ...prev].slice(0, MAX_SESSIONS))
    setActiveId(s.id)
    return s.id
  }, [setSessions, setActiveId])

  const remove = useCallback((id) => {
    setSessions((prev) => prev.filter((s) => s.id !== id))
    setActiveId((cur) => (cur === id ? null : cur))
  }, [setSessions, setActiveId])

  const clearAll = useCallback(() => {
    setSessions([])
    setActiveId(null)
  }, [setSessions, setActiveId])

  const appendMessage = useCallback((id, message) => {
    setSessions((prev) => prev.map((s) => {
      if (s.id !== id) return s
      const messages = [...s.messages, message]
      const title =
        s.title === 'New chat' && message.role === 'user'
          ? titleFrom(message.content)
          : s.title
      return { ...s, messages, title, updatedAt: Date.now() }
    }))
  }, [setSessions])

  const updateLastAssistant = useCallback((id, patch) => {
    setSessions((prev) => prev.map((s) => {
      if (s.id !== id) return s
      const messages = [...s.messages]
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], ...patch }
          break
        }
      }
      return { ...s, messages, updatedAt: Date.now() }
    }))
  }, [setSessions])

  const dropLast = useCallback((id) => {
    setSessions((prev) => prev.map((s) => {
      if (s.id !== id) return s
      if (s.messages.length === 0) return s
      return { ...s, messages: s.messages.slice(0, -1), updatedAt: Date.now() }
    }))
  }, [setSessions])

  return {
    sessions,
    activeId,
    active,
    create,
    remove,
    clearAll,
    appendMessage,
    updateLastAssistant,
    dropLast,
    setActiveId,
  }
}