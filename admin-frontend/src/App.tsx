import { useEffect, useState } from 'react'
import './App.css'

interface HealthResponse {
  status: string
  demo_data: string
}

type ConnectionState = 'loading' | 'connected' | 'failed'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('loading')
  const [healthData, setHealthData] = useState<HealthResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    let ignore = false
    async function getHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`)
        if (!response.ok) {
          throw new Error(`Server returned status code ${response.status}`)
        }
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

    getHealth()
    return () => {
      ignore = true
    }
  }, [])

  const handleRetry = async () => {
    setConnectionState('loading')
    setErrorMessage('')
    try {
      const response = await fetch(`${API_BASE_URL}/health`)
      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`)
      }
      const data: HealthResponse = await response.json()
      setHealthData(data)
      setConnectionState('connected')
    } catch (err) {
      setConnectionState('failed')
      setHealthData(null)
      setErrorMessage(err instanceof Error ? err.message : 'Failed to connect to the backend server.')
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
      </main>
    </div>
  )
}

export default App


