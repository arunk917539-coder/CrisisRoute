export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || '/api').replace(/\/+$/, '')

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(12000) })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    const message = typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map((entry: { msg?: string }) => entry.msg || 'Invalid input').join('; ')
      : `Server returned ${response.status}`
    throw new Error(message)
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
