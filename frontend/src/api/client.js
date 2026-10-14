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

/**
 * Fetch the full scraped article detail (hero, blocks, images, full_text).
 * Longer timeout: first fetch scrapes the AWS page (cached afterward).
 */
export async function getArticle(id) {
  const { data } = await api.get(`/article/${id}`, { timeout: 30000 })
  return data
}

/**
 * Download an LLM-generated one-pager infographic PDF for a news item.
 * Triggers a browser download. Returns nothing; throws on failure.
 */
export async function downloadInfographic(item) {
  const res = await api.get(`/infographic/${item.id}`, {
    responseType: 'blob',
    timeout: 60000, // LLM generation can take a bit
  })
  const blob = new Blob([res.data], { type: 'application/pdf' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const slug = (item.title || 'aws-news')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
  a.download = `${slug || 'aws-news'}-infographic.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

/**
 * Generate and download a PDF of a chat answer (question + answer + sources).
 */
export async function downloadChatPdf({ question, answer, sources }) {
  const res = await api.post(
    '/chat/pdf',
    { question, answer, sources },
    { responseType: 'blob', timeout: 60000 }
  )
  const blob = new Blob([res.data], { type: 'application/pdf' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const slug = (question || 'aws-chat')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 50)
  a.download = `${slug || 'aws-chat'}-answer.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

export default api