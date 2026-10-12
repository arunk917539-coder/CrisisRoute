import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE_URL, apiFetch, displayTime } from '../api'
import { Timeline } from './IncidentWorkspace'
import type { TimelineEvent } from './IncidentWorkspace'
import { loadSupportingEvidence } from '../evidenceReview'
import type { EvidenceSnapshotState } from '../evidenceReview'

interface Question { id: number; question: string; answer: string | null; asked_at: string; answered_at: string | null; asked_by: string }
interface Photo { id: number; filename: string; content_type: string; size_bytes: number; created_at: string }
interface AiStatus { enabled: boolean; available: boolean; provider: string; model: string; message: string }
interface AiSuggestion { report_id: number; similarity: number; reason: string; relationship_type: string; method: string }

function EvidencePhoto({ photo, onLoaded }: { photo: Photo; onLoaded: (id: number) => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    apiFetch(`${API_BASE_URL}/photos/${photo.id}/content`, { signal: controller.signal }).then(response => response.blob())
      .then(blob => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) } })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Image unavailable') })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [photo.id, retry])
  return <figure className="evidence-photo">
    {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Supporting evidence: ${photo.filename}`} onLoad={() => onLoaded(photo.id)} onError={() => { setError('Unable to display this image. Retry before recording an evidence review.'); setUrl('') }} /></a> : error ? <div><p role="alert">{error}</p><button className="btn-open-report" onClick={() => { setError(''); setRetry(value => value + 1) }}>Retry image</button></div> : <p>Loading image…</p>}
    <figcaption>{photo.filename}<span>{Math.ceil(photo.size_bytes / 1024)} KB · {displayTime(photo.created_at)}</span></figcaption>
  </figure>
}

export function ReportCollaboration({ reportId, canEdit, canContactCitizen, refreshKey, onChanged, onOpenReport, onEvidenceSnapshot }: { reportId: number; canEdit: boolean; canContactCitizen: boolean; refreshKey: number; onChanged: () => void; onOpenReport: (id: number) => void; onEvidenceSnapshot: (state: EvidenceSnapshotState) => void }) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [snapshotVersion, setSnapshotVersion] = useState<string | null | undefined>(undefined)
  const [loadedPhotoIds, setLoadedPhotoIds] = useState<number[]>([])
  const photoLoaded = useCallback((id: number) => setLoadedPhotoIds(ids => ids.includes(id) ? ids : [...ids, id]), [])
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [localRefresh, setLocalRefresh] = useState(0)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [aiError, setAiError] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiChecked, setAiChecked] = useState(false)
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const aiController = useRef<AbortController | null>(null)
  useEffect(() => () => aiController.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    loadSupportingEvidence<Question, Photo, TimelineEvent>(reportId, controller.signal)
      .then(snapshot => { if (!controller.signal.aborted) { setQuestions(snapshot.questions); setPhotos(snapshot.photos); setTimeline(snapshot.timeline); setSnapshotVersion(snapshot.version); setError('') } })
      .catch(err => { if (!controller.signal.aborted) { setSnapshotVersion(undefined); setError(err instanceof Error ? err.message : 'Unable to refresh report details') } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [reportId, refreshKey, localRefresh])
  useEffect(() => {
    onEvidenceSnapshot({ reportId, version: snapshotVersion ?? null, ready: snapshotVersion !== undefined && photos.every(photo => loadedPhotoIds.includes(photo.id)) })
  }, [reportId, snapshotVersion, photos, loadedPhotoIds, onEvidenceSnapshot])
  useEffect(() => {
    const controller = new AbortController()
    apiFetch(`${API_BASE_URL}/ai/status`, { signal: controller.signal }).then(response => response.json()).then(setAiStatus)
      .catch(err => { if (!controller.signal.aborted) setAiError(err instanceof Error ? err.message : 'Unable to check AI availability') })
    return () => controller.abort()
  }, [])

  function changed() { setLocalRefresh(value => value + 1); onChanged() }
  async function askQuestion(event: FormEvent) {
    event.preventDefault()
    if (!canEdit || !canContactCitizen) return
    setBusy(true); setActionError(''); setMessage('')
    try {
      await apiFetch(`${API_BASE_URL}/reports/${reportId}/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: question.trim() }) })
      setQuestion(''); setMessage('Question sent to the citizen’s tracking page.'); changed()
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Unable to request information') }
    finally { setBusy(false) }
  }
  async function uploadPhoto(event: FormEvent) {
    event.preventDefault()
    if (!file || !canEdit) return
    setActionError(''); setMessage('')
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 3 * 1024 * 1024) { setActionError('Choose a JPEG or PNG image up to 3 MB.'); return }
    setBusy(true)
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Unable to read the selected image'))
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.readAsDataURL(file)
      })
      await apiFetch(`${API_BASE_URL}/reports/${reportId}/photos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, data_base64: data }) })
      setFile(null); if (inputRef.current) inputRef.current.value = ''; setMessage('Supporting photo attached. Review its context before making a decision.'); changed()
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Unable to attach image') }
    finally { setBusy(false) }
  }
  async function compareWithAi() {
    if (!canEdit) return
    setAiBusy(true); setAiError(''); setAiChecked(false)
    const controller = new AbortController()
    aiController.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 90000)
    try {
      const status: AiStatus = await (await apiFetch(`${API_BASE_URL}/ai/status`, { signal: controller.signal })).json()
      setAiStatus(status)
      if (!status.enabled || !status.available) { setAiError(status.message || 'AI comparison is not available.'); return }
      const result: { suggestions: AiSuggestion[] } = await (await apiFetch(`${API_BASE_URL}/reports/${reportId}/ai-compare`, { method: 'POST', signal: controller.signal })).json()
      setSuggestions(result.suggestions); setAiChecked(true); onChanged()
    } catch (err) { setAiError(controller.signal.aborted ? 'Comparison timed out or was cancelled. You can retry.' : err instanceof Error ? err.message : 'Unable to compare reports') }
    finally { window.clearTimeout(timeout); setAiBusy(false); aiController.current = null }
  }

  return <div className="report-collaboration">
    {loading && <p role="status">Loading questions, images, and history…</p>}
    {error && <p role="alert" className="error-state">Latest report details unavailable: {error}</p>}
    <section className="evidence-section"><h3 className="evidence-title">Request more information</h3>
      <p className="sync-note">Ask a specific question. The citizen can reply from their private tracking page. Answers support review and do not verify a report automatically.</p>
      {!loading && questions.length === 0 && <p>No questions have been asked.</p>}
      {questions.map(item => <article className="question-card" key={item.id}><strong>{item.question}</strong><p className="sync-note">Asked {displayTime(item.asked_at)}{item.asked_by ? ` by ${item.asked_by}` : ''}</p>
        {item.answer ? <><p className="citizen-answer"><strong>Citizen response:</strong> {item.answer}</p><p className="sync-note">Answered {displayTime(item.answered_at)}</p></> : <p className="warning-note">Awaiting citizen response</p>}
      </article>)}
      {!canContactCitizen && <p className="warning-note">This report has no private citizen tracking key. Follow-up questions are available for new reports submitted through the citizen portal.</p>}
      {canEdit && canContactCitizen && <form className="feature-form" onSubmit={askQuestion}><label>Question for the citizen<textarea className="input-field" required minLength={3} maxLength={1000} value={question} onChange={event => setQuestion(event.target.value)} placeholder="For example: Is the bridge still blocked, and when did you last check?" /></label><button className="btn-action confirm" disabled={busy || !question.trim()}>{busy ? 'Saving…' : 'Request information'}</button></form>}
    </section>
    <section className="evidence-section"><h3 className="evidence-title">Photo evidence</h3><p className="sync-note">Images support human review. A photo alone does not establish location, time, or authenticity. Access is restricted to authorized responders and the citizen with the private tracking key.</p>
      <div className="evidence-gallery">{photos.map(photo => <EvidencePhoto key={photo.id} photo={photo} onLoaded={photoLoaded} />)}</div>
      {!loading && photos.length === 0 && <p>No photos attached.</p>}
      {canEdit && photos.length < 3 && <form className="feature-form" onSubmit={uploadPhoto}><label>Attach a supporting photo<input ref={inputRef} type="file" accept="image/jpeg,image/png" onChange={event => { setFile(event.target.files?.[0] ?? null); setActionError('') }} /></label><p className="sync-note">JPEG or PNG, up to 3 MB each; maximum 3 photos per report.</p><button className="btn-action confirm" disabled={busy || !file}>{busy ? 'Saving…' : 'Upload photo'}</button></form>}
      {photos.length >= 3 && <p className="sync-note">The maximum of 3 photos is attached.</p>}
    </section>
    {actionError && <p className="error-state" role="alert">{actionError}</p>}{message && <p className="success-message" role="status">{message}</p>}
    <section className="evidence-section"><h3 className="evidence-title">AI-assisted report comparison</h3>
      <p className="sync-note">Find possible matches with different wording or languages. Suggestions require human review; they never verify reports or change relief quantities.</p>
      {aiStatus && <p>{aiStatus.message} {aiStatus.available && <span className="sync-note">Model: {aiStatus.model}</span>}</p>}
      {aiStatus && !aiStatus.available && <p className="sync-note">Your administrator can enable the local AI service using the project setup guide. All other review tools remain available.</p>}
      {canEdit && <button className="btn-action confirm" disabled={aiBusy} onClick={() => void compareWithAi()}>{aiBusy ? 'Comparing reports…' : 'Compare related reports'}</button>}
      {aiBusy && <p role="status" className="sync-note">The first comparison may take longer while the local model loads.</p>}
      {aiError && <p className="error-state" role="alert">{aiError}</p>}
      {aiChecked && suggestions.length === 0 && <p>No additional related reports were suggested.</p>}
      {suggestions.map(suggestion => <article className="related-report" key={suggestion.report_id}><strong>Report #{suggestion.report_id} · {(suggestion.similarity * 100).toFixed(1)}% semantic similarity</strong><p>{suggestion.reason}</p><p className="sync-note">Suggested {suggestion.relationship_type.replaceAll('_', ' ')}. Review the relationship in the reconciliation queue.</p><button className="btn-open-report" onClick={() => onOpenReport(suggestion.report_id)}>Inspect report #{suggestion.report_id}</button></article>)}
    </section>
    <section className="evidence-section"><h3 className="evidence-title">Decision and delivery timeline</h3><Timeline events={timeline} /></section>
  </div>
}
