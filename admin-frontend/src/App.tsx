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

    fetchHealth()
    fetchDashboard()
    fetchReports()

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
                  <span className="report-meta-label">
                    {new Date(report.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="report-body">
                  <p className="report-description">{report.description}</p>
                  <div className="report-meta-grid">
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
    </div>
  )
}

export default App



