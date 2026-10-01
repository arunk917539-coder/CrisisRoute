import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { API_BASE_URL, apiFetch, displayTime, resourceCategory } from './api'
import { OperationalMap } from './components/OperationalMap'

interface HealthResponse {
  status: string
  reconciliation: string
  human_review_required: boolean
}

interface DashboardResponse {
  report_count: number
  unverified_report_count: number
  pending_relationship_count: number
  verified_need_count: number
  uncovered_need_count: number
}

interface Report {
  id: number
  report_type: string
  category: string
  description: string
  location: string
  people_affected: number
  required_quantity: number
  timestamp: string
  verification_status: string
  latitude?: number | null
  longitude?: number | null
  priority?: string
  is_synthetic?: boolean
  reviewed_at?: string | null
  review_note?: string
  evidence_reviewed?: boolean
  evidence?: { status: string; source: string; note: string; freshness: string; observed_at: string | null }
}

interface QueueItem {
  relationship_id: number
  relationship_type: string
  similarity: number
  reason: string
  decision_guidance: string
  report_a: Report
  report_b: Report
}

interface QueueResponse {
  count: number
  items: QueueItem[]
}

interface EvidenceResponse {
  report_id: number
  evidence_status: string
  evidence_source: string
  evidence_note: string
  observed_at: string
  age_minutes: number | null
  freshness: string
  human_review_required: boolean
  reviewed?: boolean
}

interface Resource {
  id: number
  name: string
  resource_type: string
  unit: string
  location: string
  latitude?: number
  longitude?: number
  available_quantity: number
  allocated_quantity: number
  status: string
  source: string
  is_synthetic: boolean
}

interface NeedCoverage {
  need_id: number
  report_id: number
  verified_quantity: number
  unit: string
  allocated_quantity: number
  outstanding_allocated_quantity?: number
  remaining_to_allocate: number
  delivered_quantity: number
  uncovered_quantity: number
  coverage_percent: number
}

interface AllocationRecord {
  id: number
  need_id: number
  resource_id: number
  allocated_quantity: number
  delivered_quantity: number
  remaining_quantity: number
}

type ConnectionState = 'loading' | 'connected' | 'failed'

interface Relationship {
  id: number
  report_a_id: number
  report_b_id: number
  relationship_type: string
  reason: string
  similarity: number
  decision: string
}
interface AuditEvent {
  id: number
  entity_type: string
  entity_id: number
  summary: string
  created_at: string
}

function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading')
  const [mapRefreshKey, setMapRefreshKey] = useState<number>(0)
  const [healthData, setHealthData] = useState<HealthResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')

  const [dashboardState, setDashboardState] = useState<ConnectionState>('loading')
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null)
  const [dashboardError, setDashboardError] = useState<string>('')

  const [reportsState, setReportsState] = useState<ConnectionState>('loading')
  const [reports, setReports] = useState<Report[]>([])
  const [reportsError, setReportsError] = useState<string>('')

  const [queueState, setQueueState] = useState<ConnectionState>('loading')
  const [queueData, setQueueData] = useState<QueueResponse | null>(null)
  const [queueError, setQueueError] = useState<string>('')

  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [evidenceState, setEvidenceState] = useState<ConnectionState>('loading')
  const [evidenceData, setEvidenceData] = useState<EvidenceResponse | null>(null)
  const [evidenceError, setEvidenceError] = useState<string>('')

  const [submittingDecisionId, setSubmittingDecisionId] = useState<number | null>(null)
  const [failedDecisionId, setFailedDecisionId] = useState<number | null>(null)
  const [decisionError, setDecisionError] = useState<string>('')
  const [decisionSuccessMessage, setDecisionSuccessMessage] = useState<string>('')
  const [confirmAction, setConfirmAction] = useState<{ id: number, decision: 'accept' | 'reject' | 'unresolved', label: string } | null>(null)

  const [reviewingEvidenceId, setReviewingEvidenceId] = useState<number | null>(null)
  const [evidenceReviewError, setEvidenceReviewError] = useState<string>('')
  const [evidenceReviewSuccess, setEvidenceReviewSuccess] = useState<string>('')

  const [needUnit, setNeedUnit] = useState('units')
  const [reviewNote, setReviewNote] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [relationshipsError, setRelationshipsError] = useState('')
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
  const [auditError, setAuditError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const refreshSequence = useRef(0)
  const refreshInFlight = useRef(false)
  const selectedReportId = useRef<number | null>(null)
  const reportDialog = useRef<HTMLDivElement>(null)
  const [needQuantity, setNeedQuantity] = useState<number | ''>('')
  const [creatingNeed, setCreatingNeed] = useState<boolean>(false)
  const [needError, setNeedError] = useState<string>('')
  const [needSuccess, setNeedSuccess] = useState<string>('')

  const [resourcesState, setResourcesState] = useState<ConnectionState>('loading')
  const [resources, setResources] = useState<Resource[]>([])
  const [resourcesError, setResourcesError] = useState<string>('')

  const [coverageState, setCoverageState] = useState<ConnectionState>('loading')
  const [coverage, setCoverage] = useState<NeedCoverage[]>([])
  const [coverageError, setCoverageError] = useState<string>('')

  const [allocationsState, setAllocationsState] = useState<ConnectionState>('loading')
  const [allocations, setAllocations] = useState<AllocationRecord[]>([])
  const [allocationsError, setAllocationsError] = useState<string>('')

  const [newResource, setNewResource] = useState({
    name: '',
    resource_type: '',
    unit: 'units',
    location: '',
    latitude: '',
    longitude: '',
    available_quantity: '' as number | '',
    source: ''
  })
  const [addingResource, setAddingResource] = useState(false)
  const [addResourceError, setAddResourceError] = useState('')
  const [addResourceSuccess, setAddResourceSuccess] = useState('')

  const [allocNeedId, setAllocNeedId] = useState<number | ''>('')
  const [allocResourceId, setAllocResourceId] = useState<number | ''>('')
  const [allocQuantity, setAllocQuantity] = useState<number | ''>('')
  const [allocatingState, setAllocatingState] = useState(false)
  const [allocError, setAllocError] = useState('')
  const [allocSuccess, setAllocSuccess] = useState('')

  const [deliveryNeedId, setDeliveryNeedId] = useState<number | ''>('')
  const [deliveryAllocationId, setDeliveryAllocationId] = useState<number | ''>('')
  const [deliveryQuantity, setDeliveryQuantity] = useState<number | ''>('')
  const [deliveringState, setDeliveringState] = useState(false)
  const [deliveryError, setDeliveryError] = useState('')
  const [deliverySuccess, setDeliverySuccess] = useState('')

  const handleRefreshData = useCallback(async (background = false) => {
    if (background && refreshInFlight.current) return
    const sequence = ++refreshSequence.current
    refreshInFlight.current = true
    setRefreshing(true)
    const current = () => sequence === refreshSequence.current
    async function load<T>(path: string, apply: (data: T) => void, state: (value: ConnectionState) => void, error: (value: string) => void) {
      try {
        const response = await apiFetch(`${API_BASE_URL}${path}`)
        const data: T = await response.json()
        if (current()) { apply(data); state('connected'); error('') }
      } catch (err) {
        if (current()) { state('failed'); error(err instanceof Error ? err.message : 'Unable to load data') }
      }
    }
    await Promise.allSettled([
      load<HealthResponse>('/health', setHealthData, setConnectionState, setErrorMessage),
      load<DashboardResponse>('/dashboard', setDashboardData, setDashboardState, setDashboardError),
      load<Report[]>('/reports', data => {
        setReports(data)
        setSelectedReport(previous => previous ? data.find(report => report.id === previous.id) ?? null : null)
      }, setReportsState, setReportsError),
      load<QueueResponse>('/reconciliation/queue', setQueueData, setQueueState, setQueueError),
      load<Resource[]>('/resources', setResources, setResourcesState, setResourcesError),
      load<{ needs: NeedCoverage[] }>('/coverage', data => setCoverage(data.needs), setCoverageState, setCoverageError),
      load<AllocationRecord[]>('/allocations', setAllocations, setAllocationsState, setAllocationsError),
      load<Relationship[]>('/relationships', setRelationships, () => {}, setRelationshipsError),
      load<AuditEvent[]>('/audit?limit=100', setAuditEvents, () => {}, setAuditError),
    ])
    if (current()) {
      setLastUpdated(new Date().toISOString())
      setMapRefreshKey(previous => previous + 1)
      refreshInFlight.current = false
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void handleRefreshData()
    const interval = window.setInterval(() => void handleRefreshData(true), 5000)
    return () => { window.clearInterval(interval); refreshSequence.current += 1; refreshInFlight.current = false }
  }, [handleRefreshData])

  const activeReportId = selectedReport?.id
  useEffect(() => {
    if (!activeReportId) return
    let ignore = false
    apiFetch(`${API_BASE_URL}/reports/${activeReportId}/evidence`)
      .then(response => response.json())
      .then((data: EvidenceResponse) => {
        if (!ignore) { setEvidenceData(data); setEvidenceState('connected'); setEvidenceError('') }
      })
      .catch(err => {
        if (!ignore) { setEvidenceState('failed'); setEvidenceError(err instanceof Error ? err.message : 'Unable to load evidence') }
      })
    return () => { ignore = true }
  }, [activeReportId, mapRefreshKey])

  useEffect(() => {
    if (!activeReportId) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    reportDialog.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [activeReportId])

  useEffect(() => {
    if (!activeReportId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const controls = reportDialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')
        if (controls?.length) {
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (event.shiftKey && (document.activeElement === first || document.activeElement === reportDialog.current)) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
      }
      if (event.key === 'Escape' && !creatingNeed && reviewingEvidenceId === null) {
        selectedReportId.current = null
        setSelectedReport(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeReportId, creatingNeed, reviewingEvidenceId])

  const handleRetry = () => { void handleRefreshData() }

  const submitDecision = async (id: number, decision: 'accept' | 'reject' | 'unresolved') => {
    setSubmittingDecisionId(id)
    setFailedDecisionId(null)
    setDecisionError('')
    setDecisionSuccessMessage('')
    try {
      const response = await apiFetch(`${API_BASE_URL}/relationships/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      })
      if (!response.ok) throw new Error(`Decision API returned ${response.status}`)
      
      setDecisionSuccessMessage(`Successfully recorded decision: ${decision}`)
      setTimeout(() => setDecisionSuccessMessage(''), 4000)
      
      handleRefreshData()
    } catch (err) {
      setFailedDecisionId(id)
      setDecisionError(err instanceof Error ? err.message : 'Failed to submit decision')
    } finally {
      setSubmittingDecisionId(null)
      setConfirmAction(null)
    }
  }

  const submitEvidenceReview = async (reportId: number) => {
    setReviewingEvidenceId(reportId)
    setEvidenceReviewError('')
    setEvidenceReviewSuccess('')
    try {
      await apiFetch(`${API_BASE_URL}/reports/${reportId}/evidence/review`, { method: 'POST' })
      if (selectedReportId.current === reportId) {
        setEvidenceReviewSuccess('Evidence review recorded. Make your operational decision below.')
        setSelectedReport(previous => previous?.id === reportId ? { ...previous, evidence_reviewed: true } : previous)
        setEvidenceData(previous => previous?.report_id === reportId ? { ...previous, reviewed: true, human_review_required: false } : previous)
      }
      await handleRefreshData()
    } catch (err) {
      if (selectedReportId.current === reportId) setEvidenceReviewError(err instanceof Error ? err.message : 'Failed to submit evidence review')
    } finally { setReviewingEvidenceId(null) }
  }

  const submitReportReview = async (decision: 'accept' | 'reject' | 'unresolved') => {
    if (!selectedReport) return
    const reportId = selectedReport.id
    if (decision === 'accept' && selectedReport.report_type === 'relief' && (needQuantity === '' || !Number.isFinite(needQuantity) || needQuantity <= 0 || needQuantity > selectedReport.required_quantity || !needUnit.trim())) {
      setNeedError('Enter a positive verified quantity no greater than the request, and a unit.')
      return
    }
    setCreatingNeed(true)
    setNeedError('')
    setNeedSuccess('')
    try {
      const response = await apiFetch(`${API_BASE_URL}/reports/${reportId}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, note: reviewNote.trim(), ...(decision === 'accept' && selectedReport.report_type === 'relief' ? { verified_quantity: Number(needQuantity), unit: needUnit.trim() } : {}) })
      })
      const data = await response.json()
      if (selectedReportId.current === reportId) {
        setNeedSuccess(`Human decision recorded: ${data.verification_status}${data.need_id ? `. Verified Need #${data.need_id}` : ''}.`)
        setSelectedReport(previous => previous?.id === reportId ? { ...previous, verification_status: data.verification_status, reviewed_at: data.reviewed_at, review_note: data.review_note } : previous)
      }
      await handleRefreshData()
    } catch (err) {
      if (selectedReportId.current === reportId) setNeedError(err instanceof Error ? err.message : 'Failed to record review')
    } finally { setCreatingNeed(false) }
  }

  const submitResource = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newResource.available_quantity === '' || !Number.isFinite(newResource.available_quantity) || newResource.available_quantity <= 0) {
      setAddResourceError('Available quantity must be greater than 0')
      return
    }
    
    setAddingResource(true)
    setAddResourceError('')
    setAddResourceSuccess('')
    try {
      const response = await apiFetch(`${API_BASE_URL}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newResource.name,
          resource_type: newResource.resource_type,
          unit: newResource.unit,
          location: newResource.location,
          latitude: newResource.latitude === '' ? null : Number(newResource.latitude),
          longitude: newResource.longitude === '' ? null : Number(newResource.longitude),
          available_quantity: Number(newResource.available_quantity),
          source: newResource.source,
          status: 'active'
        })
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.detail || `API returned ${response.status}`)
      }
      
      setAddResourceSuccess('Resource added successfully')
      setTimeout(() => setAddResourceSuccess(''), 4000)
      
      setNewResource({
        name: '',
        resource_type: '',
        unit: 'units',
        location: '',
        latitude: '',
        longitude: '',
        available_quantity: '',
        source: ''
      })
      
      handleRefreshData()
    } catch (err) {
      setAddResourceError(err instanceof Error ? err.message : 'Failed to add resource')
    } finally {
      setAddingResource(false)
    }
  }

  const submitAllocation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (allocNeedId === '' || allocResourceId === '' || allocQuantity === '' || !Number.isFinite(allocQuantity) || allocQuantity <= 0) {
      setAllocError('Please fill out all fields correctly. Quantity must be > 0.')
      return
    }

    const need = coverage.find(n => n.need_id === allocNeedId)
    const resource = resources.find(r => r.id === allocResourceId)

    if (!need) {
      setAllocError('Selected need does not exist.')
      return
    }
    if (!resource) {
      setAllocError('Selected resource does not exist.')
      return
    }
    if (need.unit.trim().toLowerCase() !== resource.unit.trim().toLowerCase()) {
      setAllocError(`Unit mismatch: need uses ${need.unit}, resource uses ${resource.unit}.`)
      return
    }
    if (resourceCategory(resource.resource_type) !== resourceCategory(reports.find(report => report.id === need.report_id)?.category ?? '')) {
      setAllocError('Resource type must match the report category.')
      return
    }
    if (allocQuantity > resource.available_quantity) {
      setAllocError('Allocation exceeds remaining resource availability.')
      return
    }
    if (allocQuantity > need.remaining_to_allocate) {
      setAllocError("Allocation exceeds the need's remaining uncovered quantity.")
      return
    }
    
    setAllocatingState(true)
    setAllocError('')
    setAllocSuccess('')
    try {
      const response = await apiFetch(`${API_BASE_URL}/allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          need_id: Number(allocNeedId),
          resource_id: Number(allocResourceId),
          allocated_quantity: Number(allocQuantity)
        })
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.detail || `API returned ${response.status}`)
      }
      
      setAllocSuccess('Resource allocated successfully')
      setTimeout(() => setAllocSuccess(''), 4000)
      
      setAllocNeedId('')
      setAllocResourceId('')
      setAllocQuantity('')
      
      handleRefreshData()
    } catch (err) {
      setAllocError(err instanceof Error ? err.message : 'Failed to allocate resource')
    } finally {
      setAllocatingState(false)
    }
  }

  const submitDelivery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (deliveryNeedId === '' || deliveryQuantity === '' || !Number.isFinite(deliveryQuantity) || deliveryQuantity <= 0) {
      setDeliveryError('Please fill out all required fields correctly. Quantity must be > 0.')
      return
    }

    const need = coverage.find(n => n.need_id === deliveryNeedId)
    if (!need) {
      setDeliveryError('Selected need does not exist.')
      return
    }

    if (deliveryAllocationId !== '') {
      const allocation = allocations.find(a => a.id === deliveryAllocationId)
      if (!allocation) {
        setDeliveryError('Selected allocation does not exist.')
        return
      }
      if (allocation.need_id !== deliveryNeedId) {
        setDeliveryError('Selected allocation does not belong to the selected need.')
        return
      }
      if (deliveryQuantity > allocation.remaining_quantity) {
        setDeliveryError('Delivery quantity cannot exceed the allocation remaining quantity.')
        return
      }
    }

    if (deliveryQuantity > need.uncovered_quantity) {
      setDeliveryError("Delivery quantity cannot exceed the need's remaining uncovered quantity.")
      return
    }
    if (deliveryAllocationId === '' && deliveryQuantity > need.remaining_to_allocate) {
      setDeliveryError('This quantity is reserved by an allocation. Select that allocation to record its delivery.')
      return
    }
    
    setDeliveringState(true)
    setDeliveryError('')
    setDeliverySuccess('')
    try {
      const payload: { need_id: number; delivered_quantity: number; allocation_id?: number } = {
        need_id: Number(deliveryNeedId),
        delivered_quantity: Number(deliveryQuantity)
      }
      if (deliveryAllocationId !== '') {
        payload.allocation_id = Number(deliveryAllocationId)
      }

      const response = await apiFetch(`${API_BASE_URL}/deliveries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.detail || `API returned ${response.status}`)
      }
      
      setDeliverySuccess('Delivery recorded successfully')
      setTimeout(() => setDeliverySuccess(''), 4000)
      
      setDeliveryNeedId('')
      setDeliveryAllocationId('')
      setDeliveryQuantity('')
      
      handleRefreshData()
    } catch (err) {
      setDeliveryError(err instanceof Error ? err.message : 'Failed to record delivery')
    } finally {
      setDeliveringState(false)
    }
  }

  const handleOpenReport = (report: Report) => {
    const fullReport = reports.find(item => item.id === report.id) ?? report
    selectedReportId.current = report.id
    setSelectedReport(fullReport)
    setEvidenceState('loading')
    setEvidenceError('')
    setEvidenceData(null)
    setEvidenceReviewError('')
    setEvidenceReviewSuccess('')
    setNeedQuantity(fullReport.required_quantity)
    setNeedUnit(coverage.find(need => need.report_id === report.id)?.unit ?? 'units')
    setReviewNote(fullReport.review_note ?? '')
    setNeedError('')
    setNeedSuccess('')
  }

  const handleCloseReport = () => {
    if (creatingNeed || reviewingEvidenceId !== null) return
    selectedReportId.current = null
    setSelectedReport(null)
    setNeedError('')
    setNeedSuccess('')
  }

  const priorityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
  const filteredReports = reports.filter(report =>
    (statusFilter === 'all' || report.verification_status === statusFilter) &&
    (priorityFilter === 'all' || (report.priority ?? 'medium') === priorityFilter) &&
    `${report.id} ${report.category} ${report.location} ${report.description}`.toLowerCase().includes(search.trim().toLowerCase())
  ).sort((a, b) => (priorityRank[b.priority ?? 'medium'] ?? 0) - (priorityRank[a.priority ?? 'medium'] ?? 0) || b.id - a.id)
  const selectedRelationships = selectedReport ? relationships.filter(item => item.report_a_id === selectedReport.id || item.report_b_id === selectedReport.id) : []
  const selectedNeed = selectedReport ? coverage.find(need => need.report_id === selectedReport.id) : undefined
  const selectedAudit = selectedReport ? auditEvents.filter(event =>
    (event.entity_type === 'report' && event.entity_id === selectedReport.id) ||
    (event.entity_type === 'need' && event.entity_id === selectedNeed?.need_id) ||
    (event.entity_type === 'relationship' && selectedRelationships.some(item => item.id === event.entity_id))
  ) : []
  const allocationNeed = coverage.find(need => need.need_id === allocNeedId)
  const allocationCategory = reports.find(report => report.id === allocationNeed?.report_id)?.category
  const matchingResources = resources.filter(resource => resource.status === 'active' && resource.available_quantity > 0 &&
    resource.unit.trim().toLowerCase() === allocationNeed?.unit.trim().toLowerCase() &&
    resourceCategory(resource.resource_type) === resourceCategory(allocationCategory ?? ''))
  const deliveryNeed = coverage.find(need => need.need_id === deliveryNeedId)
  const deliveryLimit = deliveryAllocationId === '' ? deliveryNeed?.remaining_to_allocate : allocations.find(allocation => allocation.id === deliveryAllocationId)?.remaining_quantity

  const coverageByUnit = coverage.reduce((acc, need) => {
    const unit = need.unit.toLowerCase()
    if (!acc[unit]) {
      acc[unit] = { verified: 0, delivered: 0, uncovered: 0 }
    }
    acc[unit].verified += need.verified_quantity
    acc[unit].delivered += need.delivered_quantity
    acc[unit].uncovered += need.uncovered_quantity
    return acc
  }, {} as Record<string, { verified: number; delivered: number; uncovered: number }>)
  const units = Object.keys(coverageByUnit)

  return (
    <div className="app-container">
      <header className="header">
        <div className="brand-section">
          <div className="brand-icon">CR</div>
          <div className="brand-title">
            <span className="brand-name">CrisisRoute</span>
            <span className="brand-subtitle">Responder Command Center</span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <h2 className="section-title">System Status</h2>
        <div className="status-card">
          <div className="card-header">
            <span className="card-title">Backend Connectivity</span>
            <span className={`status-badge ${connectionState}`}>
              <span className="status-dot"></span>
              {connectionState === 'loading' && 'Connecting...'}
              {connectionState === 'connected' && 'Connected'}
              {connectionState === 'failed' && 'Connection Error'}
            </span>
          </div>

          <div className="card-body">
            <div className="info-row">
              <span className="info-label">Endpoint URL</span>
              <span className="info-value">{API_BASE_URL}/health</span>
            </div>

            {connectionState === 'loading' && (
              <div className="info-row">
                <span className="info-value">Connecting to backend...</span>
              </div>
            )}

            {connectionState === 'connected' && healthData && (
              <div className="data-grid">
                <div className="info-row">
                  <span className="info-label">Status</span>
                  <span className="info-value">{healthData.status}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Relationship suggestions</span>
                  <span className="info-value">{healthData.reconciliation}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Human review</span>
                  <span className="info-value">{healthData.human_review_required ? 'Required for operational decisions' : 'See report evidence'}</span>
                </div>
              </div>
            )}

            {connectionState === 'failed' && (
              <>
                <div className="error-box">
                  <strong>Unable to connect:</strong> {errorMessage || 'Could not reach server.'}
                </div>
                <button
                  type="button"
                  className="retry-button"
                  onClick={handleRetry}
                >
                  Retry Connection
                </button>
              </>
            )}
          </div>
        </div>

        <div className="section-header-row">
          <h2 className="section-title">Responder Overview</h2>
          <button className="refresh-button" onClick={() => void handleRefreshData()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh Data'}
          </button>
        </div>

        <p className="sync-note" role="status">Automatic refresh every 5 seconds. Last refresh attempt: {lastUpdated ? displayTime(lastUpdated) : 'Connecting…'}.</p>
        {dashboardState === 'loading' && (
          <div className="loading-state">Loading overview data...</div>
        )}

        {dashboardState === 'failed' && (
          <div className="error-state">
            <strong>Error loading overview:</strong> {dashboardError}
          </div>
        )}

        {dashboardData && (
          <div className="overview-grid">
            <div className="summary-card">
              <span className="summary-value">{dashboardData.report_count}</span>
              <span className="summary-label">Total Reports</span>
            </div>
            <div className="summary-card">
              <span className="summary-value">{dashboardData.unverified_report_count}</span>
              <span className="summary-label">Unverified Reports</span>
            </div>
            <div className="summary-card">
              <span className="summary-value">{dashboardData.pending_relationship_count}</span>
              <span className="summary-label">Pending Relationships</span>
            </div>
            <div className="summary-card">
              <span className="summary-value">{dashboardData.verified_need_count}</span>
              <span className="summary-label">Verified Needs</span>
            </div>
            <div className="summary-card">
              <span className="summary-value">{dashboardData.uncovered_need_count}</span>
              <span className="summary-label">Uncovered Needs</span>
            </div>
          </div>
        )}

        <OperationalMap apiBaseUrl={API_BASE_URL} refreshTrigger={mapRefreshKey} resources={resources} allocations={allocations} reports={reports} onOpenReport={handleOpenReport} />

        <h2 className="section-title" style={{ marginTop: '2rem' }}>Reconciliation Queue</h2>
        
        {decisionSuccessMessage && (
          <div className="success-message">
            {decisionSuccessMessage}
          </div>
        )}
        
        {queueState === 'loading' && (
          <div className="loading-state">Loading queue items...</div>
        )}

        {queueState === 'failed' && (
          <div className="error-state">
            <strong>Error loading reconciliation queue:</strong> {queueError}
          </div>
        )}

        {queueState === 'connected' && queueData?.items.length === 0 && (
          <div className="empty-state">Queue is clear! No relationships to reconcile.</div>
        )}

        {queueData && queueData.items.length > 0 && (
          <div className="queue-list">
            {queueData.items.map((item) => (
              <div key={item.relationship_id} className="queue-card">
                <div className="queue-header">
                  <div className="queue-title">
                    <span className={`queue-type-badge ${item.relationship_type}`}>
                      {item.relationship_type.replace('_', ' ')}
                    </span>
                    <span className="queue-reason">{item.reason}</span>
                  </div>
                  <div className="queue-similarity">
                    Similarity: {(item.similarity * 100).toFixed(1)}%
                  </div>
                </div>
                
                <p className="sync-note">{item.decision_guidance}</p>
                <div className="queue-compare-grid">
                  <div className="queue-report-box">
                    <div className="queue-report-header">
                      <span className="report-id">Report A: #{item.report_a.id}</span>
                      <button className="btn-open-report" onClick={() => handleOpenReport(item.report_a)}>
                        Open
                      </button>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Description</span>
                      <span className="report-meta-value">"{item.report_a.description}"</span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Location</span>
                      <span className="report-meta-value">{item.report_a.location}</span>
                      <span className="report-meta-value">{item.report_a.required_quantity} requested · {displayTime(item.report_a.timestamp)}</span>
                      {item.report_a.evidence && <span className={`report-meta-value ${item.report_a.evidence.freshness === 'stale' ? 'warning-note' : ''}`}>Evidence: {item.report_a.evidence.status} · {item.report_a.evidence.freshness} · {item.report_a.evidence.source}<br />{item.report_a.evidence.note}</span>}
                    </div>
                  </div>

                  <div className="queue-report-box">
                    <div className="queue-report-header">
                      <span className="report-id">Report B: #{item.report_b.id}</span>
                      <button className="btn-open-report" onClick={() => handleOpenReport(item.report_b)}>
                        Open
                      </button>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Description</span>
                      <span className="report-meta-value">"{item.report_b.description}"</span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Location</span>
                      <span className="report-meta-value">{item.report_b.location}</span>
                      <span className="report-meta-value">{item.report_b.required_quantity} requested · {displayTime(item.report_b.timestamp)}</span>
                      {item.report_b.evidence && <span className={`report-meta-value ${item.report_b.evidence.freshness === 'stale' ? 'warning-note' : ''}`}>Evidence: {item.report_b.evidence.status} · {item.report_b.evidence.freshness} · {item.report_b.evidence.source}<br />{item.report_b.evidence.note}</span>}
                    </div>
                  </div>
                </div>

                {decisionError && failedDecisionId === item.relationship_id && (
                  <div className="error-state" style={{ padding: '0.75rem', marginBottom: 0 }}>
                    <strong>Error:</strong> {decisionError}
                  </div>
                )}
                
                {confirmAction?.id === item.relationship_id ? (
                  <div className="queue-actions" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>Are you sure you want to {confirmAction.label}?</p>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        className="btn-action confirm" 
                        onClick={() => submitDecision(item.relationship_id, confirmAction.decision)}
                        disabled={submittingDecisionId === item.relationship_id}
                      >
                        {submittingDecisionId === item.relationship_id ? 'Submitting...' : 'Yes, Confirm'}
                      </button>
                      <button 
                        className="btn-action unresolved" 
                        onClick={() => setConfirmAction(null)}
                        disabled={submittingDecisionId === item.relationship_id}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="queue-actions">
                    <button 
                      className="btn-action confirm" 
                      onClick={() => setConfirmAction({ id: item.relationship_id, decision: 'accept', label: 'Accept Relationship' })}
                      disabled={submittingDecisionId === item.relationship_id}
                    >
                      Accept Relationship
                    </button>
                    <button 
                      className="btn-action reject"
                      onClick={() => setConfirmAction({ id: item.relationship_id, decision: 'reject', label: 'Reject Relationship' })}
                      disabled={submittingDecisionId === item.relationship_id}
                    >
                      Reject Relationship
                    </button>
                    <button 
                      className="btn-action unresolved"
                      onClick={() => submitDecision(item.relationship_id, 'unresolved')}
                      disabled={submittingDecisionId === item.relationship_id}
                    >
                      Keep Unresolved
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}


        <h2 className="section-title" style={{ marginTop: '2rem' }}>Incoming Reports</h2>

        <div className="report-filters">
          <label>Search reports<input className="input-field" value={search} onChange={event => setSearch(event.target.value)} placeholder="ID, location, category or description" /></label>
          <label>Review status<select className="input-field" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>{['unverified', 'unresolved', 'verified', 'rejected'].map(status => <option key={status} value={status}>{status}</option>)}
          </select></label>
          <label>Priority<select className="input-field" value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}>
            <option value="all">All priorities</option>{['critical', 'high', 'medium', 'low'].map(priority => <option key={priority} value={priority}>{priority}</option>)}
          </select></label>
        </div>
        {reports.length > 0 && filteredReports.length === 0 && <div className="empty-state">No reports match these filters.</div>}
        {reportsState === 'loading' && (
          <div className="loading-state">Loading reports...</div>
        )}

        {reportsState === 'failed' && (
          <div className="error-state">
            <strong>Error loading reports:</strong> {reportsError}
          </div>
        )}

        {reportsState === 'connected' && reports.length === 0 && (
          <div className="empty-state">No incoming reports at this time.</div>
        )}

        {reportsState !== 'loading' && filteredReports.length > 0 && (
          <div className="reports-list">
            {filteredReports.map((report) => (
              <div key={report.id} className="report-card">
                <div className="report-header">
                  <div className="report-title">
                    <span className="report-id">#{report.id}</span>
                    <span className="report-category">{report.category}</span>
                    <span className={`priority-badge ${report.priority ?? 'medium'}`}>{report.priority ?? 'medium'} priority</span>
                    {report.is_synthetic && <span className="synthetic-badge">Synthetic demo</span>}
                    <span className={`report-type-badge ${report.report_type}`}>
                      {report.report_type}
                    </span>
                  </div>
                  <button className="btn-open-report" onClick={() => handleOpenReport(report)}>
                    Open Report
                  </button>
                </div>
                <div className="report-body">
                  <p className="report-description">{report.description}</p>
                  <div className="report-meta-grid">
                    <div className="report-meta-item">
                      <span className="report-meta-label">Timestamp</span>
                      <span className="report-meta-value">{displayTime(report.timestamp)}</span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Location</span>
                      <span className="report-meta-value">{report.location}</span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">People Affected</span>
                      <span className="report-meta-value">{report.people_affected}</span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Required Qty</span>
                      <span className="report-meta-value">{report.required_quantity}</span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Verification</span>
                      <span className="report-meta-value" style={{ textTransform: 'capitalize' }}>
                        {report.verification_status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Logistics & Allocation Section */}
        <div className="section-header" style={{ marginTop: '3rem' }}>
          <h2>Resource Inventory</h2>
        </div>
        
        {resourcesState === 'loading' && <div className="loading-state">Loading resources...</div>}
        {resourcesState === 'failed' && <div className="error-state"><strong>Error:</strong> {resourcesError}</div>}
        {resourcesState !== 'loading' && (
          <div className="reports-grid">
            <div className="report-card" style={{ border: '1px solid var(--panel-border)' }}>
              <div className="report-header">
                <div className="report-title">
                  <span>Add New Resource</span>
                </div>
              </div>
              <div className="report-body">
                <form onSubmit={submitResource} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <label className="inventory-label">Resource name<input type="text" placeholder="Water bottles" value={newResource.name} onChange={e => setNewResource({...newResource, name: e.target.value})} required minLength={2} className="input-field" /></label>
                  <label className="inventory-label">Resource type<input type="text" placeholder="Drinking Water, Food, Medical…" value={newResource.resource_type} onChange={e => setNewResource({...newResource, resource_type: e.target.value})} required minLength={2} className="input-field" /></label>
                  <label className="inventory-label">Resource unit<input type="text" placeholder="litres, meals, units…" value={newResource.unit} onChange={e => setNewResource({...newResource, unit: e.target.value})} required minLength={1} className="input-field" /></label>
                  <label className="inventory-label">Resource location<input type="text" placeholder="Address or area" value={newResource.location} onChange={e => setNewResource({...newResource, location: e.target.value})} required minLength={2} className="input-field" /></label>
                  <label className="inventory-label">Latitude (optional)<input type="number" step="any" min="-90" max="90" placeholder="e.g. 17.3850" value={newResource.latitude} onChange={e => setNewResource({...newResource, latitude: e.target.value})} className="input-field" /></label>
                  <label className="inventory-label">Longitude (optional)<input type="number" step="any" min="-180" max="180" placeholder="e.g. 78.4867" value={newResource.longitude} onChange={e => setNewResource({...newResource, longitude: e.target.value})} className="input-field" /></label>
                  <label className="inventory-label">Available quantity<input type="number" step="any" placeholder="Quantity" value={newResource.available_quantity} onChange={e => setNewResource({...newResource, available_quantity: e.target.value === '' ? '' : Number(e.target.value)})} required min={0.000001} className="input-field" /></label>
                  <label className="inventory-label">Resource source<input type="text" placeholder="Warehouse A" value={newResource.source} onChange={e => setNewResource({...newResource, source: e.target.value})} required minLength={2} className="input-field" /></label>
                  {addResourceError && <div className="error-state" style={{ padding: '0.5rem', margin: 0 }}>{addResourceError}</div>}
                  {addResourceSuccess && <div className="success-message" style={{ padding: '0.5rem', margin: 0 }}>{addResourceSuccess}</div>}
                  <button type="submit" className="btn-action confirm" disabled={addingResource}>
                    {addingResource ? 'Adding...' : 'Add Resource'}
                  </button>
                </form>
              </div>
            </div>

            {resources.map(resource => (
              <div key={resource.id} className="report-card">
                <div className="report-header">
                  <div className="report-title">
                    <span className="report-id">#{resource.id}</span>
                    <span>{resource.name}</span>
                    <span className={`report-type-badge`} style={{ backgroundColor: '#2563eb' }}>{resource.resource_type}</span>
                  </div>
                </div>
                <div className="report-body">
                  <div className="report-meta-grid">
                    <div className="report-meta-item"><span className="report-meta-label">Location</span><span className="report-meta-value">{resource.location}</span></div>
                    <div className="report-meta-item"><span className="report-meta-label">Source</span><span className="report-meta-value">{resource.source}</span></div>
                    <div className="report-meta-item"><span className="report-meta-label">Available Qty</span><span className="report-meta-value">{resource.available_quantity} {resource.unit}</span></div>
                    <div className="report-meta-item"><span className="report-meta-label">Allocated Qty</span><span className="report-meta-value">{resource.allocated_quantity} {resource.unit}</span></div>
                    <div className="report-meta-item"><span className="report-meta-label">Status</span><span className="report-meta-value">{resource.status}</span></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="section-header" style={{ marginTop: '3rem' }}>
          <h2>Verified Needs & Coverage</h2>
        </div>
        
        {coverageState === 'loading' && <div className="loading-state">Loading coverage...</div>}
        {coverageState === 'failed' && <div className="error-state"><strong>Error:</strong> {coverageError}</div>}
        {coverageState !== 'loading' && (
          <>
            <div className="reports-grid" style={{ marginBottom: '2rem' }}>
              <div className="report-card" style={{ gridColumn: '1 / -1', background: 'var(--bg-dark)', border: '1px solid var(--panel-border)' }}>
                <div className="report-header">
                  <div className="report-title">
                    <span>Coverage Summary</span>
                  </div>
                </div>
                <div className="report-body">
                  {units.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)' }}>No verified needs found.</div>
                  ) : units.length === 1 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', textAlign: 'center' }}>
                      <div style={{ padding: '1rem', background: 'var(--panel-bg)', borderRadius: '0.25rem', border: '1px solid var(--panel-border)' }}>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Verified Requirement</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{coverageByUnit[units[0]].verified} <span style={{fontSize: '1rem', fontWeight: 'normal', color: 'var(--text-muted)'}}>{units[0]}</span></div>
                      </div>
                      <div style={{ padding: '1rem', background: 'var(--panel-bg)', borderRadius: '0.25rem', border: '1px solid #3b82f6' }}>
                        <div style={{ fontSize: '0.875rem', color: '#3b82f6', marginBottom: '0.5rem' }}>Total Delivered</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{coverageByUnit[units[0]].delivered} <span style={{fontSize: '1rem', fontWeight: 'normal', opacity: 0.8}}>{units[0]}</span></div>
                      </div>
                      <div style={{ padding: '1rem', background: 'var(--panel-bg)', borderRadius: '0.25rem', border: '1px solid #ef4444' }}>
                        <div style={{ fontSize: '0.875rem', color: '#ef4444', marginBottom: '0.5rem' }}>Total Uncovered</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{coverageByUnit[units[0]].uncovered} <span style={{fontSize: '1rem', fontWeight: 'normal', opacity: 0.8}}>{units[0]}</span></div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {units.map(unit => (
                        <div key={unit} style={{ padding: '1rem', background: 'var(--panel-bg)', borderRadius: '0.25rem', border: '1px solid var(--panel-border)' }}>
                          <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--text-main)', marginBottom: '0.5rem', textTransform: 'capitalize' }}>{unit}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', textAlign: 'center' }}>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Verified</div>
                              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{coverageByUnit[unit].verified}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginBottom: '0.25rem' }}>Delivered</div>
                              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#3b82f6' }}>{coverageByUnit[unit].delivered}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#ef4444', marginBottom: '0.25rem' }}>Uncovered</div>
                              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#ef4444' }}>{coverageByUnit[unit].uncovered}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {units.every(u => coverageByUnit[u].uncovered === 0) && units.length > 0 && (
                    <div className="success-message" style={{ marginTop: '1rem', textAlign: 'center' }}>
                      All verified needs are fully covered.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="reports-grid">
              {coverage.map(need => {
                const isUncovered = need.uncovered_quantity > 0;
                return (
                  <div key={need.need_id} className="report-card" style={{ border: isUncovered ? '1px solid #ef4444' : '1px solid #10b981' }}>
                    <div className="report-header">
                      <div className="report-title">
                        <span className="report-id">Need #{need.need_id}</span>
                        <span>Report #{need.report_id}</span>
                        {isUncovered && <span className="report-type-badge" style={{ backgroundColor: '#ef4444' }}>Uncovered</span>}
                      </div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: need.coverage_percent >= 100 ? '#10b981' : '#f59e0b' }}>
                        {need.coverage_percent}% Covered
                      </div>
                    </div>
                    <div className="report-body">
                      <div style={{ width: '100%', height: '8px', background: 'var(--bg-dark)', borderRadius: '4px', marginBottom: '1rem', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(need.coverage_percent, 100)}%`, height: '100%', background: need.coverage_percent >= 100 ? '#10b981' : '#f59e0b', transition: 'width 0.3s' }}></div>
                      </div>
                      <div className="report-meta-grid">
                        <div className="report-meta-item"><span className="report-meta-label">Verified Qty</span><span className="report-meta-value">{need.verified_quantity} {need.unit}</span></div>
                        <div className="report-meta-item"><span className="report-meta-label">Delivered Qty</span><span className="report-meta-value" style={{ color: '#3b82f6', fontWeight: 'bold' }}>{need.delivered_quantity} {need.unit}</span></div>
                        <div className="report-meta-item"><span className="report-meta-label">Uncovered Qty</span><span className="report-meta-value" style={{ color: isUncovered ? '#ef4444' : 'inherit', fontWeight: isUncovered ? 'bold' : 'normal' }}>{need.uncovered_quantity} {need.unit}</span></div>
                        <div className="report-meta-item" style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '0.5rem', marginTop: '0.5rem' }}><span className="report-meta-label">Outstanding Allocated Qty</span><span className="report-meta-value">{need.outstanding_allocated_quantity ?? need.allocated_quantity} {need.unit}</span></div>
                        <div className="report-meta-item" style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '0.5rem', marginTop: '0.5rem' }}><span className="report-meta-label">Remaining to Allocate</span><span className="report-meta-value">{need.remaining_to_allocate} {need.unit}</span></div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="section-header" style={{ marginTop: '3rem' }}>
          <h2>Allocate Resource</h2>
        </div>
        <div className="reports-grid">
          <div className="report-card" style={{ gridColumn: '1 / -1', border: '1px solid #10b981' }}>
            <div className="report-body">
              <form onSubmit={submitAllocation} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="report-meta-label" htmlFor="allocation-need">Need to allocate</label>
                  <select id="allocation-need" className="input-field" value={allocNeedId} onChange={e => {
                    setAllocNeedId(e.target.value === '' ? '' : Number(e.target.value))
                    setAllocResourceId('')
                    setAllocQuantity('')
                  }} required>
                    <option value="">-- Select Need --</option>
                    {coverage.filter(n => n.remaining_to_allocate > 0).map(n => (
                      <option key={n.need_id} value={n.need_id}>Need #{n.need_id} (Needs {n.remaining_to_allocate} {n.unit})</option>
                    ))}
                  </select>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="report-meta-label" htmlFor="allocation-resource">Select Resource</label>
                  <select id="allocation-resource" className="input-field" value={allocResourceId} onChange={e => setAllocResourceId(e.target.value === '' ? '' : Number(e.target.value))} required disabled={!allocNeedId}>
                    <option value="">-- Select Resource --</option>
                    {allocNeedId && matchingResources.map(r => (
                      <option key={r.id} value={r.id}>#{r.id} {r.name} ({r.available_quantity} {r.unit} avail)</option>
                    ))}
                  </select>
                  {allocationNeed && matchingResources.length === 0 && <small>No active stock matches this need's category and unit. Add compatible inventory above.</small>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="report-meta-label" htmlFor="allocation-quantity">Quantity to Allocate</label>
                  <input id="allocation-quantity" type="number" step="any" className="input-field" placeholder="Quantity" value={allocQuantity} onChange={e => setAllocQuantity(e.target.value === '' ? '' : Number(e.target.value))} required min={0.000001} max={allocationNeed ? Math.min(allocationNeed.remaining_to_allocate, resources.find(resource => resource.id === allocResourceId)?.available_quantity ?? allocationNeed.remaining_to_allocate) : undefined} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button type="submit" className="btn-action confirm" style={{ backgroundColor: '#10b981' }} disabled={allocatingState}>
                    {allocatingState ? 'Allocating...' : 'Allocate'}
                  </button>
                </div>
              </form>
              
              {allocError && <div className="error-state" style={{ marginTop: '1rem', marginBottom: 0 }}>{allocError}</div>}
              {allocSuccess && <div className="success-message" style={{ marginTop: '1rem', marginBottom: 0 }}>{allocSuccess}</div>}
            </div>
          </div>
        </div>

        <div className="section-header" style={{ marginTop: '3rem' }}>
          <h2>Record Delivery</h2>
        </div>
        <div className="reports-grid">
          <div className="report-card" style={{ gridColumn: '1 / -1', border: '1px solid #3b82f6' }}>
            <div className="report-body">
              <form onSubmit={submitDelivery} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="report-meta-label" htmlFor="delivery-need">Need receiving delivery</label>
                  <select id="delivery-need" className="input-field" value={deliveryNeedId} onChange={e => {
                    setDeliveryNeedId(e.target.value === '' ? '' : Number(e.target.value))
                    setDeliveryAllocationId('')
                    setDeliveryQuantity('')
                  }} required>
                    <option value="">-- Select Need --</option>
                    {coverage.filter(n => n.uncovered_quantity > 0).map(n => (
                      <option key={n.need_id} value={n.need_id}>Need #{n.need_id} ({n.uncovered_quantity} {n.unit} uncovered)</option>
                    ))}
                  </select>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="report-meta-label" htmlFor="delivery-allocation">Select Allocation (Optional)</label>
                  <select id="delivery-allocation" className="input-field" value={deliveryAllocationId} onChange={e => setDeliveryAllocationId(e.target.value === '' ? '' : Number(e.target.value))} disabled={!deliveryNeedId}>
                    <option value="">-- No Allocation / Direct Delivery --</option>
                    {deliveryNeedId && allocations.filter(a => a.need_id === deliveryNeedId && a.remaining_quantity > 0).map(a => (
                      <option key={a.id} value={a.id}>Alloc #{a.id} ({a.remaining_quantity} remaining)</option>
                    ))}
                  </select>
                  {deliveryNeed && deliveryAllocationId === '' && <small>Direct delivery can cover up to {deliveryNeed.remaining_to_allocate} {deliveryNeed.unit}. Select an allocation when delivering reserved stock.</small>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="report-meta-label" htmlFor="delivery-quantity">Delivered Quantity</label>
                  <input id="delivery-quantity" type="number" step="any" className="input-field" placeholder="Quantity" value={deliveryQuantity} onChange={e => setDeliveryQuantity(e.target.value === '' ? '' : Number(e.target.value))} required min={0.000001} max={deliveryLimit} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button type="submit" className="btn-action confirm" style={{ backgroundColor: '#3b82f6' }} disabled={deliveringState}>
                    {deliveringState ? 'Recording...' : 'Record Delivery'}
                  </button>
                </div>
              </form>
              
              {deliveryError && <div className="error-state" style={{ marginTop: '1rem', marginBottom: 0 }}>{deliveryError}</div>}
              {deliverySuccess && <div className="success-message" style={{ marginTop: '1rem', marginBottom: 0 }}>{deliverySuccess}</div>}
            </div>
          </div>
        </div>

        <div className="section-header" style={{ marginTop: '3rem' }}>
          <h2>Recent Allocations</h2>
        </div>
        {allocationsState === 'loading' && <div className="loading-state">Loading allocations...</div>}
        {allocationsState === 'failed' && <div className="error-state"><strong>Error:</strong> {allocationsError}</div>}
        {allocationsState !== 'loading' && (
          <div className="reports-grid">
            {allocations.length === 0 ? (
              <div style={{ color: 'var(--text-muted)' }}>No allocations found.</div>
            ) : (
              allocations.map(alloc => (
                <div key={alloc.id} className="report-card">
                  <div className="report-header">
                    <div className="report-title">
                      <span className="report-id">Alloc #{alloc.id}</span>
                      <span>Need #{alloc.need_id} &rarr; Res #{alloc.resource_id}</span>
                    </div>
                  </div>
                  <div className="report-body">
                    <div className="report-meta-grid">
                      <div className="report-meta-item"><span className="report-meta-label">Allocated Qty</span><span className="report-meta-value">{alloc.allocated_quantity}</span></div>
                      <div className="report-meta-item"><span className="report-meta-label">Delivered via this Allocation</span><span className="report-meta-value">{alloc.delivered_quantity}</span></div>
                      <div className="report-meta-item"><span className="report-meta-label">Remaining in Allocation</span><span className="report-meta-value">{alloc.remaining_quantity}</span></div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        <section className="evidence-section">
          <h2 className="section-title">Recent responder activity</h2>
          {auditError && <div className="error-state">{auditError}</div>}
          {!auditError && auditEvents.length === 0 && <p>No activity recorded yet.</p>}
          {auditEvents.slice(0, 10).map(event => <p className="audit-row" key={event.id}><time>{displayTime(event.created_at)}</time> {event.summary}</p>)}
        </section>
      </main>

      {/* Report Details Modal */}
      {selectedReport && (
        <div className="modal-overlay" onClick={handleCloseReport}>
          <div ref={reportDialog} tabIndex={-1} className="modal-content" role="dialog" aria-modal="true" aria-label={`Report ${selectedReport.id} details`} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <span className="report-id">#{selectedReport.id}</span>
                <span>{selectedReport.category}</span>
                <span className={`priority-badge ${selectedReport.priority ?? 'medium'}`}>{selectedReport.priority ?? 'medium'} priority</span>
                {selectedReport.is_synthetic && <span className="synthetic-badge">Synthetic demo</span>}
                <span className={`report-type-badge ${selectedReport.report_type}`}>
                  {selectedReport.report_type}
                </span>
              </div>
              <button className="modal-close" aria-label="Close report details" disabled={creatingNeed || reviewingEvidenceId !== null} onClick={handleCloseReport}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="report-meta-item">
                <span className="report-meta-label">Description</span>
                <span className="report-meta-value">{selectedReport.description}</span>
              </div>

              <div className="report-meta-grid">
                <div className="report-meta-item">
                  <span className="report-meta-label">Timestamp</span>
                  <span className="report-meta-value">{displayTime(selectedReport.timestamp)}</span>
                </div>
                <div className="report-meta-item">
                  <span className="report-meta-label">Location</span>
                  <span className="report-meta-value">{selectedReport.location}</span>
                </div>
                <div className="report-meta-item">
                  <span className="report-meta-label">People Affected</span>
                  <span className="report-meta-value">{selectedReport.people_affected}</span>
                </div>
                <div className="report-meta-item">
                  <span className="report-meta-label">Required Qty</span>
                  <span className="report-meta-value">{selectedReport.required_quantity}</span>
                </div>
                <div className="report-meta-item">
                  <span className="report-meta-label">Verification</span>
                  <span className="report-meta-value" style={{ textTransform: 'capitalize' }}>
                    {selectedReport.verification_status}
                  </span>
                </div>
              </div>

              <div className="evidence-section">
                <div className="evidence-title">Evidence & Verification</div>
                
                {evidenceState === 'loading' && (
                  <div className="loading-state" style={{ padding: '2rem 1rem' }}>Loading evidence...</div>
                )}
                
                {evidenceState === 'failed' && (
                  <div className="error-state" style={{ padding: '1rem', marginBottom: 0 }}>
                    <strong>Error:</strong> {evidenceError}
                  </div>
                )}
                
                {evidenceState === 'connected' && evidenceData && (
                  <div className="report-meta-grid" style={{ background: 'transparent', padding: 0, border: 'none' }}>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Evidence Status</span>
                      <span className="report-meta-value" style={{ textTransform: 'capitalize' }}>
                        {evidenceData.evidence_status}
                      </span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Evidence Source</span>
                      <span className="report-meta-value">{evidenceData.evidence_source || 'N/A'}</span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Evidence Note</span>
                      <span className="report-meta-value">{evidenceData.evidence_note || 'N/A'}</span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Observed At</span>
                      <span className="report-meta-value">
                        {displayTime(evidenceData.observed_at)}
                      </span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Freshness</span>
                      <span className="report-meta-value evidence-field-value" style={{ textTransform: 'capitalize' }}>
                        {evidenceData.freshness}{evidenceData.age_minutes !== null ? ` · ${Math.round(evidenceData.age_minutes)} minutes old` : ''}
                      </span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Human Review Required</span>
                      <span className="report-meta-value evidence-field-value">
                        {evidenceData.human_review_required ? 'YES' : 'NO'}
                      </span>
                    </div>
                  </div>
                )}

                {evidenceState === 'connected' && evidenceData && (
                  <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '1rem' }}>
                    {evidenceReviewError && (
                      <div className="error-state" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
                        <strong>Error:</strong> {evidenceReviewError}
                      </div>
                    )}
                    {evidenceReviewSuccess && (
                      <div className="success-message" style={{ marginBottom: '1rem' }}>
                        {evidenceReviewSuccess}
                      </div>
                    )}
                    <button 
                      className="btn-action confirm" 
                      onClick={() => submitEvidenceReview(evidenceData.report_id)}
                      disabled={reviewingEvidenceId === evidenceData.report_id || !evidenceData.human_review_required}
                    >
                      {reviewingEvidenceId === evidenceData.report_id ? 'Submitting...' : evidenceData.human_review_required ? 'Mark Evidence as Reviewed' : 'Evidence Review Recorded'}
                    </button>
                  </div>
                )}
              </div>

              <div className="evidence-section">
                <h3 className="evidence-title">Related reports & human relationship decisions</h3>
                <p className="sync-note">Similarity and conflict signals are advisory. Accepting a relationship does not verify a report or add its quantity to a need.</p>
                {relationshipsError && <div className="error-state">{relationshipsError}</div>}
                {!relationshipsError && selectedRelationships.length === 0 && <p>No related reports detected.</p>}
                {selectedRelationships.map(item => {
                  const other = reports.find(report => report.id === (item.report_a_id === selectedReport.id ? item.report_b_id : item.report_a_id))
                  return <div className="related-report" key={item.id}>
                    <strong>{item.relationship_type.replaceAll('_', ' ')} · {(item.similarity * 100).toFixed(1)}% similarity</strong>
                    <p>{item.reason}</p><p>Human relationship decision: <strong>{item.decision}</strong></p>
                    {other && <><p>Report #{other.id}: {other.description}</p><p>{other.location} · {other.required_quantity} requested · {displayTime(other.timestamp)}</p>
                      <button className="btn-open-report" disabled={creatingNeed || reviewingEvidenceId !== null} onClick={() => handleOpenReport(other)}>Inspect Report #{other.id}</button></>}
                  </div>
                })}
              </div>
              <div className="evidence-section human-review">
                <h3 className="evidence-title">Human operational review</h3>
                <p>Review the evidence and related reports, then record your decision. Only a responder can verify this report.</p>
                {selectedReport.reviewed_at && <p>Last decision: {displayTime(selectedReport.reviewed_at)} · {selectedReport.review_note || 'No note provided'}</p>}
                {selectedNeed ? <div className="success-message">Verified Need #{selectedNeed.need_id}: {selectedNeed.verified_quantity} {selectedNeed.unit} required · {selectedNeed.delivered_quantity} delivered · {selectedNeed.uncovered_quantity} uncovered ({selectedNeed.coverage_percent}% covered).</div> : selectedReport.verification_status === 'verified' ? <p className="success-message">Report verified by a responder.</p> : <>
                  <label className="review-label">Decision note<textarea className="input-field" maxLength={1000} value={reviewNote} onChange={event => setReviewNote(event.target.value)} placeholder="Record the reason for your decision" /></label>
                  {selectedReport.report_type === 'relief' && <div className="report-filters">
                    <label>Verified quantity<input className="input-field" type="number" step="any" min="0.01" max={selectedReport.required_quantity} value={needQuantity} onChange={event => setNeedQuantity(event.target.value === '' ? '' : Number(event.target.value))} /></label>
                    <label>Unit<input className="input-field" maxLength={40} value={needUnit} onChange={event => setNeedUnit(event.target.value)} placeholder="units, litres, meals…" /></label>
                  </div>}
                  {!selectedReport.evidence_reviewed && !evidenceData?.reviewed && <p className="warning-note">Record an explicit evidence review before accepting.</p>}
                  <div className="queue-actions">
                    <button className="btn-action confirm" disabled={creatingNeed || (!selectedReport.evidence_reviewed && !evidenceData?.reviewed)} onClick={() => void submitReportReview('accept')}>{creatingNeed ? 'Saving…' : selectedReport.report_type === 'relief' ? 'Accept & Create Verified Need' : 'Accept & Verify Report'}</button>
                    <button className="btn-action reject" disabled={creatingNeed} onClick={() => void submitReportReview('reject')}>Reject Report</button>
                    <button className="btn-action unresolved" disabled={creatingNeed} onClick={() => void submitReportReview('unresolved')}>Mark Unresolved</button>
                  </div>
                </>}
                {needError && <div className="error-state" role="alert">{needError}</div>}
              </div>
              <div className="evidence-section">
                <h3 className="evidence-title">Recent history for this report</h3>
                {auditError && <div className="error-state">{auditError}</div>}
                {selectedAudit.length === 0 && <p>No matching events in the latest 100 records.</p>}
                {selectedAudit.map(event => <p className="audit-row" key={event.id}><time>{displayTime(event.created_at)}</time> {event.summary}</p>)}
              </div>

              {needSuccess && (
                <div className="success-message" style={{ marginTop: '1.5rem' }}>
                  {needSuccess}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App



