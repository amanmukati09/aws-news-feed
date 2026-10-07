import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 20000,
})

export async function getNews(params = {}) {
  const { data } = await api.get('/news', { params })
  return data
}

export async function getHealth() {
  const { data } = await api.get('/health')
  return data
}

export async function getCategories() {
  const { data } = await api.get('/categories')
  return data
}

/**
 * Force the backend to re-fetch every RSS feed (bypasses TTL cache).
 * Returns updated health info: last_successful_refresh, cache_age_seconds,
 * cached_items, errors.
 */
export async function refreshFeeds() {
  const { data } = await api.post('/refresh')
  return data
}

export async function askChat(question) {
  const { data } = await api.post('/chat', { question })
  return data
}

export default api