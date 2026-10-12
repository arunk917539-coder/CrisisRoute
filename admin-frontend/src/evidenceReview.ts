import { API_BASE_URL, apiFetch } from './api.ts'

export interface EvidenceSnapshotState { reportId: number; version: string | null; ready: boolean }
export class EvidenceChangedError extends Error {}

export async function loadSupportingEvidence<Q, P, T>(reportId: number, signal: AbortSignal): Promise<{ version: string | null; questions: Q[]; photos: P[]; timeline: T[] }> {
  const path = `${API_BASE_URL}/reports/${reportId}`
  async function version() {
    const body = await (await apiFetch(`${path}/evidence`, { signal })).json()
    if (body.evidence_version !== null && typeof body.evidence_version !== 'string') throw new Error('The server did not provide an evidence version. Refresh after updating the backend.')
    return body.evidence_version as string | null
  }
  const before = await version()
  const [questions, photos, timeline] = await Promise.all([
    apiFetch(`${path}/questions`, { signal }).then(response => response.json()) as Promise<Q[]>,
    apiFetch(`${path}/photos`, { signal }).then(response => response.json()) as Promise<P[]>,
    apiFetch(`${path}/timeline`, { signal }).then(response => response.json()) as Promise<T[]>,
  ])
  const after = await version()
  if (before !== after) throw new EvidenceChangedError('New evidence arrived while this report was loading. Wait for the refreshed replies and photos before reviewing.')
  return { version: after, questions, photos, timeline }
}

export function evidenceSnapshotMatches(snapshot: EvidenceSnapshotState | null, reportId: number | undefined, version: string | null | undefined): boolean {
  return Boolean(snapshot?.ready && snapshot.reportId === reportId && version !== undefined && snapshot.version === version)
}
