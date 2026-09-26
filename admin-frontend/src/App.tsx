import { useEffect, useState } from 'react'
import './App.css'

interface HealthResponse {
  status: string
  demo_data: string
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
}

interface Resource {
  id: number
  name: string
  resource_type: string
  unit: string
  location: string
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading')
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

  const [needQuantity, setNeedQuantity] = useState<number | ''>('')
  const [creatingNeed, setCreatingNeed] = useState<boolean>(false)
  const [needError, setNeedError] = useState<string>('')
  const [needSuccess, setNeedSuccess] = useState<string>('')

  const [resourcesState, setResourcesState] = useState<ConnectionState>('loading')
  const [resources, setResources] = useState<Resource[]>([])
  const [resourcesError, setResourcesError] = useState<string>('')

  const [coverageState, setCoverageState] = useState<ConnectionState>('loading')
  const [coverage, setCoverage] = useState<NeedCoverage[]>([])
  const [coverageSummary, setCoverageSummary] = useState({ total_verified: 0, total_delivered: 0, total_uncovered: 0 })
  const [coverageError, setCoverageError] = useState<string>('')

  const [allocationsState, setAllocationsState] = useState<ConnectionState>('loading')
  const [allocations, setAllocations] = useState<AllocationRecord[]>([])
  const [allocationsError, setAllocationsError] = useState<string>('')

  const [newResource, setNewResource] = useState({
    name: '',
    resource_type: '',
    unit: 'units',
    location: '',
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

  useEffect(() => {
    let ignore = false

    async function fetchHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`)
        if (!response.ok) throw new Error(`Server returned status code ${response.status}`)
        const data: HealthResponse = await response.json()
        if (!ignore) {
          setHealthData(data)
          setConnectionState('connected')
        }
      } catch (err) {
        if (!ignore) {
          setConnectionState('failed')
          setHealthData(null)
          setErrorMessage(err instanceof Error ? err.message : 'Failed to connect to the backend server.')
        }
      }
    }

    async function fetchDashboard() {
      try {
        const response = await fetch(`${API_BASE_URL}/dashboard`)
        if (!response.ok) throw new Error(`Dashboard API returned ${response.status}`)
        const data: DashboardResponse = await response.json()
        if (!ignore) {
          setDashboardData(data)
          setDashboardState('connected')
        }
      } catch (err) {
        if (!ignore) {
          setDashboardState('failed')
          setDashboardError(err instanceof Error ? err.message : 'Failed to load dashboard')
        }
      }
    }

    async function fetchReports() {
      try {
        const response = await fetch(`${API_BASE_URL}/reports`)
        if (!response.ok) throw new Error(`Reports API returned ${response.status}`)
        const data: Report[] = await response.json()
        if (!ignore) {
          setReports(data)
          setReportsState('connected')
        }
      } catch (err) {
        if (!ignore) {
          setReportsState('failed')
          setReportsError(err instanceof Error ? err.message : 'Failed to load reports')
        }
      }
    }

    async function fetchQueue() {
      try {
        const response = await fetch(`${API_BASE_URL}/reconciliation/queue`)
        if (!response.ok) throw new Error(`Queue API returned ${response.status}`)
        const data: QueueResponse = await response.json()
        if (!ignore) {
          setQueueData(data)
          setQueueState('connected')
        }
      } catch (err) {
        if (!ignore) {
          setQueueState('failed')
          setQueueError(err instanceof Error ? err.message : 'Failed to load queue')
        }
      }
    }

    async function fetchResources() {
      try {
        const response = await fetch(`${API_BASE_URL}/resources`)
        if (!response.ok) throw new Error(`Resources API returned ${response.status}`)
        const data: Resource[] = await response.json()
        if (!ignore) {
          setResources(data)
          setResourcesState('connected')
        }
      } catch (err) {
        if (!ignore) {
          setResourcesState('failed')
          setResourcesError(err instanceof Error ? err.message : 'Failed to load resources')
        }
      }
    }

    async function fetchCoverage() {
      try {
        const response = await fetch(`${API_BASE_URL}/coverage`)
        if (!response.ok) throw new Error(`Coverage API returned ${response.status}`)
        const data = await response.json()
        if (!ignore) {
          setCoverage(data.needs)
          setCoverageSummary({ total_verified: data.total_verified, total_delivered: data.total_delivered, total_uncovered: data.total_uncovered })
          setCoverageState('connected')
        }
      } catch (err) {
        if (!ignore) {
          setCoverageState('failed')
          setCoverageError(err instanceof Error ? err.message : 'Failed to load coverage')
        }
      }
    }

    async function fetchAllocations() {
      try {
        const response = await fetch(`${API_BASE_URL}/allocations`)
        if (!response.ok) throw new Error(`Allocations API returned ${response.status}`)
        const data: AllocationRecord[] = await response.json()
        if (!ignore) {
          setAllocations(data)
          setAllocationsState('connected')
        }
      } catch (err) {
        if (!ignore) {
          setAllocationsState('failed')
          setAllocationsError(err instanceof Error ? err.message : 'Failed to load allocations')
        }
      }
    }

    fetchHealth()
    fetchDashboard()
    fetchReports()
    fetchQueue()
    fetchResources()
    fetchCoverage()
    fetchAllocations()

    return () => {
      ignore = true
    }
  }, [])

  const handleRetry = async () => {
    setConnectionState('loading')
    setErrorMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/health`)
      if (!response.ok) throw new Error(`Server returned status code ${response.status}`)
      const data: HealthResponse = await response.json()
      setHealthData(data)
      setConnectionState('connected')
    } catch (err) {
      setConnectionState('failed')
      setHealthData(null)
      setErrorMessage(err instanceof Error ? err.message : 'Failed to connect to the backend server.')
    }
  }

  const handleRefreshData = async () => {
    setDashboardState('loading')
    setDashboardError('')
    setReportsState('loading')
    setReportsError('')
    setQueueState('loading')
    setQueueError('')
    
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard`)
      if (!response.ok) throw new Error(`Dashboard API returned ${response.status}`)
      const data: DashboardResponse = await response.json()
      setDashboardData(data)
      setDashboardState('connected')
    } catch (err) {
      setDashboardState('failed')
      setDashboardError(err instanceof Error ? err.message : 'Failed to load dashboard')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/reports`)
      if (!response.ok) throw new Error(`Reports API returned ${response.status}`)
      const data: Report[] = await response.json()
      setReports(data)
      setReportsState('connected')
    } catch (err) {
      setReportsState('failed')
      setReportsError(err instanceof Error ? err.message : 'Failed to load reports')
    }

    try {
      const response = await fetch(`${API_BASE_URL}/reconciliation/queue`)
      if (!response.ok) throw new Error(`Queue API returned ${response.status}`)
      const data: QueueResponse = await response.json()
      setQueueData(data)
      setQueueState('connected')
    } catch (err) {
      setQueueState('failed')
      setQueueError(err instanceof Error ? err.message : 'Failed to load queue')
    }

    setResourcesState('loading')
    setResourcesError('')
    try {
      const response = await fetch(`${API_BASE_URL}/resources`)
      if (!response.ok) throw new Error(`Resources API returned ${response.status}`)
      const data: Resource[] = await response.json()
      setResources(data)
      setResourcesState('connected')
    } catch (err) {
      setResourcesState('failed')
      setResourcesError(err instanceof Error ? err.message : 'Failed to load resources')
    }

    setCoverageState('loading')
    setCoverageError('')
    try {
      const response = await fetch(`${API_BASE_URL}/coverage`)
      if (!response.ok) throw new Error(`Coverage API returned ${response.status}`)
      const data = await response.json()
      setCoverage(data.needs)
      setCoverageSummary({ total_verified: data.total_verified, total_delivered: data.total_delivered, total_uncovered: data.total_uncovered })
      setCoverageState('connected')
    } catch (err) {
      setCoverageState('failed')
      setCoverageError(err instanceof Error ? err.message : 'Failed to load coverage')
    }

    setAllocationsState('loading')
    setAllocationsError('')
    try {
      const response = await fetch(`${API_BASE_URL}/allocations`)
      if (!response.ok) throw new Error(`Allocations API returned ${response.status}`)
      const data: AllocationRecord[] = await response.json()
      setAllocations(data)
      setAllocationsState('connected')
    } catch (err) {
      setAllocationsState('failed')
      setAllocationsError(err instanceof Error ? err.message : 'Failed to load allocations')
    }
  }

  const submitDecision = async (id: number, decision: 'accept' | 'reject' | 'unresolved') => {
    setSubmittingDecisionId(id)
    setFailedDecisionId(null)
    setDecisionError('')
    setDecisionSuccessMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/relationships/${id}/decision`, {
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
      const response = await fetch(`${API_BASE_URL}/reports/${reportId}/evidence/review`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error(`Review API returned ${response.status}`)
      
      const data = await response.json()
      if (data.already_recorded) {
        setEvidenceReviewSuccess('Evidence was already reviewed.')
      } else {
        setEvidenceReviewSuccess('Evidence reviewed successfully.')
      }
      setTimeout(() => setEvidenceReviewSuccess(''), 4000)
      
      if (selectedReport && selectedReport.id === reportId) {
        const evResponse = await fetch(`${API_BASE_URL}/reports/${reportId}/evidence`)
        if (evResponse.ok) {
          const evData: EvidenceResponse = await evResponse.json()
          setEvidenceData(evData)
        }
      }
      
      handleRefreshData()
    } catch (err) {
      setEvidenceReviewError(err instanceof Error ? err.message : 'Failed to submit evidence review')
    } finally {
      setReviewingEvidenceId(null)
    }
  }

  const submitNeed = async () => {
    if (!selectedReport) return
    if (needQuantity === '' || needQuantity <= 0) {
      setNeedError('Quantity must be greater than 0')
      return
    }
    if (needQuantity > selectedReport.required_quantity) {
      setNeedError('Verified quantity cannot exceed requested quantity')
      return
    }
    
    setCreatingNeed(true)
    setNeedError('')
    setNeedSuccess('')
    try {
      const response = await fetch(`${API_BASE_URL}/needs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: selectedReport.id,
          verified_quantity: Number(needQuantity),
          unit: 'units'
        })
      })
      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.detail || `API returned ${response.status}`)
      }
      
      const data = await response.json()
      setNeedSuccess(`Successfully created Verified Need #${data.id} (${data.verified_quantity} ${data.unit})`)
      
      setSelectedReport({ ...selectedReport, verification_status: 'verified' })
      handleRefreshData()
    } catch (err) {
      setNeedError(err instanceof Error ? err.message : 'Failed to create verified need')
    } finally {
      setCreatingNeed(false)
    }
  }

  const submitResource = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newResource.available_quantity === '' || newResource.available_quantity <= 0) {
      setAddResourceError('Available quantity must be greater than 0')
      return
    }
    
    setAddingResource(true)
    setAddResourceError('')
    setAddResourceSuccess('')
    try {
      const response = await fetch(`${API_BASE_URL}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newResource.name,
          resource_type: newResource.resource_type,
          unit: newResource.unit,
          location: newResource.location,
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
    if (allocNeedId === '' || allocResourceId === '' || allocQuantity === '' || allocQuantity <= 0) {
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
    if (need.unit.toLowerCase() !== resource.unit.toLowerCase()) {
      setAllocError(`Unit mismatch: need uses ${need.unit}, resource uses ${resource.unit}.`)
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
      const response = await fetch(`${API_BASE_URL}/allocations`, {
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
    if (deliveryNeedId === '' || deliveryQuantity === '' || deliveryQuantity <= 0) {
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
    
    setDeliveringState(true)
    setDeliveryError('')
    setDeliverySuccess('')
    try {
      const payload: any = {
        need_id: Number(deliveryNeedId),
        delivered_quantity: Number(deliveryQuantity)
      }
      if (deliveryAllocationId !== '') {
        payload.allocation_id = Number(deliveryAllocationId)
      }

      const response = await fetch(`${API_BASE_URL}/deliveries`, {
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

  const handleOpenReport = async (report: Report) => {
    setSelectedReport(report)
    setEvidenceState('loading')
    setEvidenceError('')
    setEvidenceData(null)
    setEvidenceReviewError('')
    setEvidenceReviewSuccess('')
    setNeedQuantity(report.required_quantity)
    setCreatingNeed(false)
    setNeedError('')
    setNeedSuccess('')
    
    try {
      const response = await fetch(`${API_BASE_URL}/reports/${report.id}/evidence`)
      if (!response.ok) throw new Error(`Evidence API returned ${response.status}`)
      const data: EvidenceResponse = await response.json()
      setEvidenceData(data)
      setEvidenceState('connected')
    } catch (err) {
      setEvidenceState('failed')
      setEvidenceError(err instanceof Error ? err.message : 'Failed to fetch evidence details')
    }
  }

  const handleCloseReport = () => {
    setSelectedReport(null)
    setEvidenceReviewError('')
    setEvidenceReviewSuccess('')
    setNeedError('')
    setNeedSuccess('')
  }

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
                  <span className="info-label">status</span>
                  <span className="info-value">{healthData.status}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">demo_data</span>
                  <span className="info-value">{healthData.demo_data}</span>
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
          <button className="refresh-button" onClick={handleRefreshData}>
            Refresh Data
          </button>
        </div>

        {dashboardState === 'loading' && (
          <div className="loading-state">Loading overview data...</div>
        )}

        {dashboardState === 'failed' && (
          <div className="error-state">
            <strong>Error loading overview:</strong> {dashboardError}
          </div>
        )}

        {dashboardState === 'connected' && dashboardData && (
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

        {queueState === 'connected' && queueData && queueData.items.length > 0 && (
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
                      onClick={() => setConfirmAction({ id: item.relationship_id, decision: 'accept', label: item.relationship_type === 'possible_duplicate' ? 'Confirm Duplicate' : 'Confirm Conflict' })}
                      disabled={submittingDecisionId === item.relationship_id}
                    >
                      {item.relationship_type === 'possible_duplicate' ? 'Confirm Duplicate' : 'Confirm Conflict'}
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

        {reportsState === 'connected' && reports.length > 0 && (
          <div className="reports-list">
            {reports.map((report) => (
              <div key={report.id} className="report-card">
                <div className="report-header">
                  <div className="report-title">
                    <span className="report-id">#{report.id}</span>
                    <span className="report-category">{report.category}</span>
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
                      <span className="report-meta-value">{new Date(report.timestamp).toLocaleString()}</span>
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
        {resourcesState === 'connected' && (
          <div className="reports-grid">
            <div className="report-card" style={{ border: '1px solid var(--panel-border)' }}>
              <div className="report-header">
                <div className="report-title">
                  <span>Add New Resource</span>
                </div>
              </div>
              <div className="report-body">
                <form onSubmit={submitResource} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <input type="text" placeholder="Resource Name (e.g. Water Bottles)" value={newResource.name} onChange={e => setNewResource({...newResource, name: e.target.value})} required minLength={2} className="input-field" />
                  <input type="text" placeholder="Resource Type (e.g. supplies)" value={newResource.resource_type} onChange={e => setNewResource({...newResource, resource_type: e.target.value})} required minLength={2} className="input-field" />
                  <input type="text" placeholder="Unit (e.g. liters)" value={newResource.unit} onChange={e => setNewResource({...newResource, unit: e.target.value})} required minLength={1} className="input-field" />
                  <input type="text" placeholder="Location" value={newResource.location} onChange={e => setNewResource({...newResource, location: e.target.value})} required minLength={2} className="input-field" />
                  <input type="number" placeholder="Available Quantity" value={newResource.available_quantity} onChange={e => setNewResource({...newResource, available_quantity: e.target.value === '' ? '' : Number(e.target.value)})} required min={1} className="input-field" />
                  <input type="text" placeholder="Source (e.g. Warehouse A)" value={newResource.source} onChange={e => setNewResource({...newResource, source: e.target.value})} required minLength={2} className="input-field" />
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
        {coverageState === 'connected' && (
          <>
            <div className="reports-grid" style={{ marginBottom: '2rem' }}>
              <div className="report-card" style={{ gridColumn: '1 / -1', background: 'var(--bg-dark)', border: '1px solid var(--panel-border)' }}>
                <div className="report-header">
                  <div className="report-title">
                    <span>Coverage Summary</span>
                  </div>
                </div>
                <div className="report-body">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', textAlign: 'center' }}>
                    <div style={{ padding: '1rem', background: 'var(--panel-bg)', borderRadius: '0.25rem', border: '1px solid var(--panel-border)' }}>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Total Verified Requirement</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-main)' }}>{coverageSummary.total_verified}</div>
                    </div>
                    <div style={{ padding: '1rem', background: 'var(--panel-bg)', borderRadius: '0.25rem', border: '1px solid #3b82f6' }}>
                      <div style={{ fontSize: '0.875rem', color: '#3b82f6', marginBottom: '0.5rem' }}>Total Delivered</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3b82f6' }}>{coverageSummary.total_delivered}</div>
                    </div>
                    <div style={{ padding: '1rem', background: 'var(--panel-bg)', borderRadius: '0.25rem', border: '1px solid #ef4444' }}>
                      <div style={{ fontSize: '0.875rem', color: '#ef4444', marginBottom: '0.5rem' }}>Total Uncovered</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{coverageSummary.total_uncovered}</div>
                    </div>
                  </div>
                  {coverageSummary.total_uncovered === 0 && coverageSummary.total_verified > 0 && (
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
                        <div className="report-meta-item" style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '0.5rem', marginTop: '0.5rem' }}><span className="report-meta-label">Allocated Qty</span><span className="report-meta-value">{need.allocated_quantity} {need.unit}</span></div>
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
                  <label className="report-meta-label">Select Verified Need</label>
                  <select className="input-field" value={allocNeedId} onChange={e => {
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
                  <label className="report-meta-label">Select Resource</label>
                  <select className="input-field" value={allocResourceId} onChange={e => setAllocResourceId(e.target.value === '' ? '' : Number(e.target.value))} required disabled={!allocNeedId}>
                    <option value="">-- Select Resource --</option>
                    {allocNeedId && resources.filter(r => r.status === 'active' && r.available_quantity > 0 && r.unit.toLowerCase() === coverage.find(n => n.need_id === allocNeedId)?.unit.toLowerCase()).map(r => (
                      <option key={r.id} value={r.id}>#{r.id} {r.name} ({r.available_quantity} {r.unit} avail)</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="report-meta-label">Quantity to Allocate</label>
                  <input type="number" className="input-field" placeholder="Quantity" value={allocQuantity} onChange={e => setAllocQuantity(e.target.value === '' ? '' : Number(e.target.value))} required min={1} />
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
                  <label className="report-meta-label">Select Verified Need</label>
                  <select className="input-field" value={deliveryNeedId} onChange={e => {
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
                  <label className="report-meta-label">Select Allocation (Optional)</label>
                  <select className="input-field" value={deliveryAllocationId} onChange={e => setDeliveryAllocationId(e.target.value === '' ? '' : Number(e.target.value))} disabled={!deliveryNeedId}>
                    <option value="">-- No Allocation / Direct Delivery --</option>
                    {deliveryNeedId && allocations.filter(a => a.need_id === deliveryNeedId && a.remaining_quantity > 0).map(a => (
                      <option key={a.id} value={a.id}>Alloc #{a.id} ({a.remaining_quantity} remaining)</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label className="report-meta-label">Delivered Quantity</label>
                  <input type="number" className="input-field" placeholder="Quantity" value={deliveryQuantity} onChange={e => setDeliveryQuantity(e.target.value === '' ? '' : Number(e.target.value))} required min={1} />
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
        {allocationsState === 'connected' && (
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
                      <div className="report-meta-item"><span className="report-meta-label">Delivered Qty</span><span className="report-meta-value">{alloc.delivered_quantity}</span></div>
                      <div className="report-meta-item"><span className="report-meta-label">Remaining Qty</span><span className="report-meta-value">{alloc.remaining_quantity}</span></div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* Report Details Modal */}
      {selectedReport && (
        <div className="modal-overlay" onClick={handleCloseReport}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <span className="report-id">#{selectedReport.id}</span>
                <span>{selectedReport.category}</span>
                <span className={`report-type-badge ${selectedReport.report_type}`}>
                  {selectedReport.report_type}
                </span>
              </div>
              <button className="modal-close" onClick={handleCloseReport}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="report-meta-item">
                <span className="report-meta-label">Description</span>
                <span className="report-meta-value">{selectedReport.description}</span>
              </div>

              <div className="report-meta-grid">
                <div className="report-meta-item">
                  <span className="report-meta-label">Timestamp</span>
                  <span className="report-meta-value">{new Date(selectedReport.timestamp).toLocaleString()}</span>
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
                        {evidenceData.observed_at ? new Date(evidenceData.observed_at).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div className="report-meta-item">
                      <span className="report-meta-label">Freshness</span>
                      <span className="report-meta-value evidence-field-value" style={{ textTransform: 'capitalize' }}>
                        {evidenceData.freshness}
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

                {evidenceState === 'connected' && evidenceData && evidenceData.human_review_required && (
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
                      disabled={reviewingEvidenceId === evidenceData.report_id}
                    >
                      {reviewingEvidenceId === evidenceData.report_id ? 'Submitting...' : 'Mark Evidence as Reviewed'}
                    </button>
                  </div>
                )}
              </div>

              {selectedReport.report_type === 'relief' && selectedReport.verification_status !== 'verified' && (
                <div className="evidence-section" style={{ marginTop: '1.5rem', backgroundColor: 'rgba(217, 119, 6, 0.1)', borderColor: 'rgba(217, 119, 6, 0.3)' }}>
                  <div className="evidence-title" style={{ color: '#fcd34d' }}>Create Verified Need</div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Evidence must be reviewed before creating a verified need. Confirm the quantity before submitting.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Verified Quantity</label>
                    <input 
                      type="number" 
                      value={needQuantity} 
                      onChange={e => setNeedQuantity(e.target.value === '' ? '' : Number(e.target.value))} 
                      max={selectedReport.required_quantity}
                      min={1}
                     
                    />
                  </div>
                  
                  {needError && (
                    <div className="error-state" style={{ padding: '0.75rem', marginTop: '1rem', marginBottom: 0 }}>
                      <strong>Error:</strong> {needError}
                    </div>
                  )}

                  <div style={{ marginTop: '1rem' }}>
                    <button 
                      className="btn-action confirm" 
                      onClick={submitNeed}
                      disabled={creatingNeed}
                      style={{ backgroundColor: '#d97706', width: '100%' }}
                    >
                      {creatingNeed ? 'Creating...' : 'Create Verified Need'}
                    </button>
                  </div>
                </div>
              )}
              
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



