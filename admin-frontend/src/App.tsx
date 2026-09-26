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

    fetchHealth()
    fetchDashboard()
    fetchReports()
    fetchQueue()

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

  const handleOpenReport = async (report: Report) => {
    setSelectedReport(report)
    setEvidenceState('loading')
    setEvidenceError('')
    setEvidenceData(null)
    setEvidenceReviewError('')
    setEvidenceReviewSuccess('')
    
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App



