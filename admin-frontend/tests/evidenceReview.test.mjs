import assert from 'node:assert/strict'
import { test } from 'node:test'

globalThis.window = { location: { origin: 'http://localhost:5174' }, dispatchEvent: () => {} }
const { loadSupportingEvidence, evidenceSnapshotMatches, EvidenceChangedError } = await import('../src/evidenceReview.ts')

function snapshotServer(versions) {
  let reads = 0
  globalThis.fetch = async url => {
    const body = url.endsWith('/evidence') ? { evidence_version: versions[reads++] } : url.endsWith('/questions') ? [{ id: 1, answer: 'Current answer' }] : url.endsWith('/photos') ? [{ id: 9 }] : []
    return new Response(JSON.stringify(body), { status: 200 })
  }
}

test('a reply/photo arriving between snapshot reads prevents review readiness', async () => {
  snapshotServer([null, '2026-10-12T10:00:00Z'])
  await assert.rejects(loadSupportingEvidence(4, new AbortController().signal), error => error instanceof EvidenceChangedError)
})

test('a consistent snapshot associates displayed replies and photos with its evidence version', async () => {
  snapshotServer(['2026-10-12T10:00:00Z', '2026-10-12T10:00:00Z'])
  const result = await loadSupportingEvidence(4, new AbortController().signal)
  assert.equal(result.version, '2026-10-12T10:00:00Z')
  assert.equal(result.questions[0].answer, 'Current answer')
  assert.equal(result.photos[0].id, 9)
  assert.equal(evidenceSnapshotMatches({ reportId: 4, version: result.version, ready: false }, 4, result.version), false)
  assert.equal(evidenceSnapshotMatches({ reportId: 4, version: result.version, ready: true }, 4, result.version), true)
  assert.equal(evidenceSnapshotMatches({ reportId: 4, version: result.version, ready: true }, 4, '2026-10-12T10:01:00Z'), false)
  assert.equal(evidenceSnapshotMatches({ reportId: 4, version: result.version, ready: true }, 5, result.version), false)
})

test('legacy null evidence versions are supported but absent version fields are rejected', async () => {
  snapshotServer([null, null])
  const result = await loadSupportingEvidence(4, new AbortController().signal)
  assert.equal(evidenceSnapshotMatches({ reportId: 4, version: result.version, ready: true }, 4, null), true)
  snapshotServer([undefined])
  await assert.rejects(loadSupportingEvidence(4, new AbortController().signal), /did not provide an evidence version/)
})
