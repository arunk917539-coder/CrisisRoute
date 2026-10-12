import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

const storage = new Map()
const events = []
globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
globalThis.window = { location: { origin: 'http://localhost:5174' }, dispatchEvent: event => events.push(event.type) }
const { apiFetch, setSessionToken, hasSessionToken, ApiError } = await import('../src/api.ts')
let requests
beforeEach(() => {
  setSessionToken(null); events.length = 0; requests = []
  globalThis.fetch = async (url, init) => { requests.push({ url, init }); return new Response('{}', { status: 200 }) }
})

test('backend requests receive the current responder bearer token', async () => {
  setSessionToken('private-token')
  await apiFetch('/api/reports', { headers: { 'Content-Type': 'application/json' } })
  assert.equal(requests[0].init.headers.get('Authorization'), 'Bearer private-token')
  assert.equal(requests[0].init.headers.get('Content-Type'), 'application/json')
})

test('tokens are never attached to external map services or similarly named paths', async () => {
  setSessionToken('private-token')
  for (const target of ['https://overpass-api.de/api/interpreter', 'https://router.project-osrm.org/route/v1/driving/1,2;3,4', '/api-other/reports', 'https://other.example/api/reports']) await apiFetch(target)
  assert.ok(requests.every(request => request.init.headers.get('Authorization') === null))
})

test('expired backend session clears credentials and notifies the sign-in screen', async () => {
  setSessionToken('expired-token')
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Session expired' }), { status: 401 })
  await assert.rejects(apiFetch('/api/reports'), error => error instanceof ApiError && error.status === 401 && error.message === 'Session expired')
  assert.equal(hasSessionToken(), false)
  assert.deepEqual(events, ['crisisroute:session-expired'])
  assert.equal(storage.size, 0)
})

test('external service failures do not log the responder out', async () => {
  setSessionToken('private-token')
  globalThis.fetch = async () => new Response('{}', { status: 401 })
  await assert.rejects(apiFetch('https://overpass-api.de/api/interpreter'))
  assert.equal(hasSessionToken(), true)
  assert.deepEqual(events, [])
})

test('late failures from an old session do not clear a newer sign-in', async () => {
  setSessionToken('old-session')
  let complete
  globalThis.fetch = () => new Promise(resolve => { complete = resolve })
  const pending = apiFetch('/api/reports')
  setSessionToken('new-session')
  complete(new Response('{}', { status: 401 }))
  await assert.rejects(pending)
  assert.equal(hasSessionToken(), true)
  assert.deepEqual(events, [])
  assert.ok([...storage.values()].includes('new-session'))
})

test('field validation errors retain actionable backend messages', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: [{ msg: 'Password must contain at least 12 characters' }] }), { status: 422 })
  await assert.rejects(apiFetch('/api/users'), /Password must contain at least 12 characters/)
})

test('explicit abort signals are preserved', async () => {
  const controller = new AbortController()
  await apiFetch('/api/reports', { signal: controller.signal })
  assert.equal(requests[0].init.signal, controller.signal)
})
