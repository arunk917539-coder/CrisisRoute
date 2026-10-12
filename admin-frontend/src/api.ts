export const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL?.trim() || '/api').replace(/\/+$/, '')
const SESSION_KEY = 'crisisroute.responder.session'
let sessionToken: string | null = null
try { sessionToken = sessionStorage.getItem(SESSION_KEY) } catch { /* In-memory sessions work when browser storage is disabled. */ }

export function setSessionToken(token: string | null) {
  sessionToken = token
  try { if (token) sessionStorage.setItem(SESSION_KEY, token); else sessionStorage.removeItem(SESSION_KEY) } catch { /* Keep the in-memory session. */ }
}
export function hasSessionToken() { return Boolean(sessionToken) }
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url, window.location.origin)
  const backend = new URL(API_BASE_URL, window.location.origin)
  const isBackend = target.origin === backend.origin && (target.pathname === backend.pathname || target.pathname.startsWith(`${backend.pathname.replace(/\/+$/, '')}/`))
  const headers = new Headers(init.headers)
  const requestToken = sessionToken
  // Route and map providers must never receive responder credentials.
  if (isBackend && requestToken) headers.set('Authorization', `Bearer ${requestToken}`)
  const response = await fetch(url, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(12000) })
  if (isBackend && response.status === 401 && requestToken && requestToken === sessionToken) {
    setSessionToken(null)
    window.dispatchEvent(new Event('crisisroute:session-expired'))
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    const message = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map((entry: { msg?: string }) => entry.msg || 'Invalid input').join('; ')
      : `Server returned ${response.status}`
    throw new ApiError(message, response.status)
  }
  return response
}

export function resourceCategory(value: string): string {
  // Keep this normalization aligned with backend.app.reconcile.normalized_category.
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  const aliases: Record<string, string> = {
    water: 'drinking water', 'potable water': 'drinking water',
    'food packets': 'food', 'food supplies': 'food',
    'medical aid': 'medical', 'medical supplies': 'medical',
  }
  return aliases[normalized] ?? normalized
}

export function displayTime(value?: string | null): string {
  if (!value) return 'Not recorded'
  // SQLite timestamps from older demo databases did not include their UTC suffix.
  const zoned = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`
  return new Date(zoned).toLocaleString()
}
