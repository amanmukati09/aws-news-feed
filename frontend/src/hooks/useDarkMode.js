import { useEffect, useState, useCallback } from 'react'

const KEY = 'awsnews.theme'

function currentIsDark() {
  if (typeof window === 'undefined') return false
  const saved = localStorage.getItem(KEY)
  if (saved === 'dark') return true
  if (saved === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(dark) {
  const root = document.documentElement
  root.classList.toggle('dark', dark)

  // Keep the declared color-scheme in sync with OUR toggle, not the OS.
  // This is what stops mobile browsers from force-darkening light mode.
  root.style.colorScheme = dark ? 'dark' : 'light'

  // Make the browser UI (address bar) match the active theme. The static
  // <meta name="theme-color" media="..."> tags follow the OS, so we override
  // with a single authoritative tag here.
  try {
    let meta = document.querySelector('meta[name="theme-color"]:not([media])')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', dark ? '#0a0f1e' : '#ffffff')
  } catch { /* ignore */ }

  try { localStorage.setItem(KEY, dark ? 'dark' : 'light') } catch { /* ignore */ }
}

/**
 * Single source of truth for theme.
 * - Reads fresh state from localStorage (so separate route components agree).
 * - Applies the `.dark` class immediately on any change.
 * - Listens for cross-component/tab changes via a custom event + storage event
 *   so toggling on one route (e.g. ArticlePage) stays in sync with App.
 */
export function useDarkMode() {
  const [dark, setDarkState] = useState(currentIsDark)

  // apply + persist whenever our state changes
  useEffect(() => {
    applyTheme(dark)
  }, [dark])

  // stay in sync if another mounted component / tab changes the theme
  useEffect(() => {
    const sync = () => setDarkState(currentIsDark())
    window.addEventListener('awsnews-theme', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('awsnews-theme', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const setDark = useCallback((next) => {
    setDarkState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      applyTheme(value)
      // notify any other mounted useDarkMode consumers
      window.dispatchEvent(new Event('awsnews-theme'))
      return value
    })
  }, [])

  return [dark, setDark]
}
