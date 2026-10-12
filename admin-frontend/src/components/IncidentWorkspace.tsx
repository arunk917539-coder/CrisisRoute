import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { API_BASE_URL, apiFetch, displayTime } from '../api'
import type { ResponderUser } from './AuthGate'

interface IncidentNeed { need_id: number; verified_quantity: number; delivered_quantity: number; uncovered_quantity: number; unit: string }
interface Incident { id: number; title: string; priority: string; report_ids: number[]; report_count: number; conflict_count: number; unresolved_count: number; stale_count: number; needs: IncidentNeed[] }
interface IncidentReport { id: number; description: string; location: string; category: string; verification_status: string; evidence_source?: string; evidence_observed_at?: string | null; is_synthetic?: boolean }
export interface TimelineEvent { id: number; event_type: string; summary: string; created_at: string; actor_name?: string }
interface IncidentDetail extends Incident { reports: IncidentReport[]; relationships: { id: number; report_a_id: number; report_b_id: number; relationship_type: string; decision: string; reason: string }[]; timeline: TimelineEvent[] }
interface StaleReport { report_id: number; description: string; location: string; priority: string; last_confirmed_at: string | null; age_hours: number | null; reason: string }

export function Timeline({ events }: { events: TimelineEvent[] }) {
  return events.length ? <ol className="event-timeline">{events.map(event => <li key={event.id}>
    <time dateTime={event.created_at}>{displayTime(event.created_at)}</time><p>{event.summary}</p>
    {event.actor_name && <span className="sync-note">Recorded by {event.actor_name}</span>}
  </li>)}</ol> : <p className="sync-note">No recorded events yet.</p>
}

export function IncidentWorkspace({ user, refreshKey, onOpenReport, onChanged }: { user: ResponderUser; refreshKey: number; onOpenReport: (id: number) => void; onChanged: () => void }) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [stale, setStale] = useState<StaleReport[]>([])
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<number | null>(null)
  const [detail, setDetail] = useState<IncidentDetail | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')
  const detailHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      apiFetch(`${API_BASE_URL}/incidents`, { signal: controller.signal }).then(response => response.json()),
      apiFetch(`${API_BASE_URL}/stale-reviews`, { signal: controller.signal }).then(response => response.json()),
    ]).then(([groups, reviews]) => { setIncidents(groups); setStale(reviews); setError('') })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to refresh incidents') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refreshKey])
  useEffect(() => {
    if (selected === null) return
    const controller = new AbortController()
    apiFetch(`${API_BASE_URL}/incidents/${selected}`, { signal: controller.signal }).then(response => response.json())
      .then(result => { setDetail(result); setDetailError('') })
      .catch(err => { if (!controller.signal.aborted) setDetailError(err instanceof Error ? err.message : 'Unable to load incident') })
    return () => controller.abort()
  }, [selected, refreshKey])
  const detailId = detail?.id
  useEffect(() => { if (detailId !== undefined) detailHeading.current?.focus() }, [selected, detailId])

  async function reconfirm(event: FormEvent) {
    event.preventDefault()
    if (confirming === null || user.role === 'viewer') return
    setSaving(true); setActionError(''); setMessage('')
    try {
      await apiFetch(`${API_BASE_URL}/reports/${confirming}/reconfirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note.trim() }) })
      setMessage(`Report #${confirming} reconfirmed.`); setConfirming(null); setNote(''); onChanged()
    } catch (err) { setActionError(err instanceof Error ? err.message : 'Unable to reconfirm report') }
    finally { setSaving(false) }
  }

  return <section className="feature-section" aria-labelledby="incident-heading">
    <div className="section-header-row"><div><h2 id="incident-heading" className="section-title">Incident workspace</h2><p className="sync-note">One view of related reports, conflicting claims, verified needs, and decisions. Reports are grouped when a responder accepts a duplicate relationship.</p></div></div>
    {loading && <p role="status">Loading incidents…</p>}
    {error && <p role="alert" className="error-state">Latest update unavailable: {error}. Previously loaded information is retained.</p>}
    {!loading && !error && incidents.length === 0 && <p>No incidents have been reported.</p>}
    <div className="incident-grid">{incidents.map(incident => <article className={`incident-card ${selected === incident.id ? 'selected' : ''}`} key={incident.id}>
      <div className="feature-heading"><h3>{incident.title}</h3><span className={`priority-badge ${incident.priority}`}>{incident.priority}</span></div>
      <p>{incident.report_count} report{incident.report_count === 1 ? '' : 's'} · {incident.conflict_count} conflict{incident.conflict_count === 1 ? '' : 's'} · {incident.unresolved_count} unresolved</p>
      {incident.stale_count > 0 && <p className="warning-note">{incident.stale_count} report{incident.stale_count === 1 ? '' : 's'} need a freshness check</p>}
      {incident.needs.map(need => <p key={need.need_id}>{need.delivered_quantity} / {need.verified_quantity} {need.unit} delivered · {need.uncovered_quantity} uncovered</p>)}
      <button className="btn-open-report" aria-expanded={selected === incident.id} onClick={() => { setDetail(null); setDetailError(''); setSelected(value => value === incident.id ? null : incident.id) }}>{selected === incident.id ? 'Close incident' : `Inspect incident #${incident.id}`}</button>
    </article>)}</div>
    {selected !== null && <div className="incident-detail">
      {detailError && <p className="error-state" role="alert">{detailError}</p>}
      {!detail && !detailError && <p role="status">Loading incident details…</p>}
      {detail && <>
        <h3 tabIndex={-1} ref={detailHeading}>Incident #{detail.id}: {detail.title}</h3>
        <div className="incident-columns"><div><h4>Reports and sources</h4>{detail.reports.map(report => <article className="related-report" key={report.id}>
          <strong>Report #{report.id} · {report.verification_status}</strong>{report.is_synthetic && <span className="synthetic-badge">Synthetic demo</span>}<p>{report.description}</p><p>{report.location}</p>
          <p className="sync-note">Source: {report.evidence_source || 'Not recorded'} · Observed: {displayTime(report.evidence_observed_at)}</p>
          <button className="btn-open-report" onClick={() => onOpenReport(report.id)}>Review report #{report.id}</button>
        </article>)}</div><div><h4>Relationships and conflicts</h4>
          {detail.relationships.length === 0 && <p className="sync-note">No related claims recorded.</p>}
          {detail.relationships.map(link => <article className="related-report" key={link.id}><strong>#{link.report_a_id} ↔ #{link.report_b_id} · {link.relationship_type.replaceAll('_', ' ')}</strong><p>{link.reason}</p><p>Human decision: {link.decision}</p><div className="feature-actions"><button className="btn-open-report" onClick={() => onOpenReport(link.report_a_id)}>Inspect #{link.report_a_id}</button><button className="btn-open-report" onClick={() => onOpenReport(link.report_b_id)}>Inspect #{link.report_b_id}</button></div></article>)}
          <h4>Verified needs</h4>{detail.needs.length === 0 && <p className="sync-note">No verified need has been created.</p>}
          {detail.needs.map(need => <p key={need.need_id}>Need #{need.need_id}: {need.verified_quantity} {need.unit} required, {need.delivered_quantity} delivered, {need.uncovered_quantity} uncovered.</p>)}
        </div></div><h4>Decision and delivery timeline</h4><Timeline events={detail.timeline} />
      </>}
    </div>}
    <div className="stale-section"><h3>Information to reconfirm</h3><p className="sync-note">Recheck the situation before confirming that a verified report is still accurate.</p>
      {!loading && !error && stale.length === 0 && <p>No verified reports currently need reconfirmation.</p>}
      {message && <p role="status" className="success-message">{message}</p>}
      {stale.map(report => <article key={report.report_id} className="stale-card"><div><strong>Report #{report.report_id} · {report.priority} priority</strong><p>{report.description}</p><p>{report.location}</p><p className="sync-note">{report.reason} · Last confirmed: {displayTime(report.last_confirmed_at)}</p></div>
        <div className="feature-actions"><button className="btn-open-report" onClick={() => onOpenReport(report.report_id)}>Inspect report</button><button className="btn-action confirm" disabled={user.role === 'viewer' || saving} onClick={() => { setConfirming(report.report_id); setNote(''); setActionError(''); setMessage('') }}>Record reconfirmation</button></div>
      </article>)}
      {confirming !== null && <form onSubmit={reconfirm} className="feature-form">
        <label>How was report #{confirming} reconfirmed?<textarea className="input-field" value={note} onChange={event => setNote(event.target.value)} required minLength={3} maxLength={1000} placeholder="Describe what you checked, with whom, and the current situation." /></label>
        <div className="feature-actions"><button className="btn-action confirm" disabled={saving || !note.trim()}>{saving ? 'Recording…' : 'Confirm information is current'}</button><button type="button" className="btn-open-report" disabled={saving} onClick={() => setConfirming(null)}>Cancel</button></div>
        {actionError && <p role="alert" className="error-state">{actionError}</p>}
      </form>}
    </div>
    {user.role === 'admin' && <UserManagement />}
  </section>
}

function UserManagement() {
  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<ResponderUser[]>([])
  const [values, setValues] = useState({ username: '', display_name: '', password: '', role: 'responder' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    apiFetch(`${API_BASE_URL}/users`, { signal: controller.signal }).then(response => response.json()).then(setUsers)
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Unable to load accounts') })
    return () => controller.abort()
  }, [open, refresh])
  async function createUser(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setSaving(true)
    try {
      await apiFetch(`${API_BASE_URL}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...values, username: values.username.trim(), display_name: values.display_name.trim() }) })
      setMessage(`Account created for ${values.display_name}.`); setValues({ username: '', display_name: '', password: '', role: 'responder' }); setRefresh(value => value + 1)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create account') }
    finally { setSaving(false) }
  }
  return <section className="accounts-section"><button className="btn-open-report" onClick={() => setOpen(value => !value)} aria-expanded={open}>{open ? 'Hide team accounts' : 'Manage team accounts'}</button>
    {open && <><h3>Team accounts</h3><p className="sync-note">Viewers can inspect information. Responders can review reports and record deliveries. Administrators can also create accounts.</p>
      <ul className="account-list">{users.map(account => <li key={account.id}><strong>{account.display_name}</strong><span>{account.username} · {account.role}</span></li>)}</ul>
      <form className="feature-form" onSubmit={createUser}><h4>Create an account</h4>
        <label>Full name<input className="input-field" required maxLength={100} value={values.display_name} onChange={event => setValues({ ...values, display_name: event.target.value })} /></label>
        <label>Username<input className="input-field" required minLength={3} maxLength={80} pattern="[a-zA-Z0-9_.\-]+" title="Use letters, digits, dots, underscores, or hyphens" autoComplete="off" value={values.username} onChange={event => setValues({ ...values, username: event.target.value })} /></label>
        <label>Initial password<input className="input-field" required minLength={12} maxLength={128} type="password" autoComplete="new-password" value={values.password} onChange={event => setValues({ ...values, password: event.target.value })} /></label>
        <label>Role<select className="input-field" value={values.role} onChange={event => setValues({ ...values, role: event.target.value })}><option value="responder">Responder</option><option value="viewer">Viewer</option><option value="admin">Administrator</option></select></label>
        <button className="btn-action confirm" disabled={saving}>{saving ? 'Creating account…' : 'Create account'}</button>
      </form>
      {error && <p role="alert" className="error-state">{error}</p>}{message && <p role="status" className="success-message">{message}</p>}
    </>}
  </section>
}
