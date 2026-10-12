import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { API_BASE_URL, apiFetch, hasSessionToken, setSessionToken } from '../api'

export interface ResponderUser { id: number; username: string; display_name: string; role: 'admin' | 'responder' | 'viewer' }

export function AuthGate({ children }: { children: (user: ResponderUser, logout: () => Promise<void>) => ReactNode }) {
  const [user, setUser] = useState<ResponderUser | null>(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let current = true
    async function check() {
      try {
        const status = await (await apiFetch(`${API_BASE_URL}/auth/status`)).json()
        if (!current) return
        setSetupRequired(status.setup_required)
        if (!status.setup_required && hasSessionToken()) {
          const account: ResponderUser = await (await apiFetch(`${API_BASE_URL}/auth/me`)).json()
          if (current) setUser(account)
        }
      } catch (err) { if (current) setError(err instanceof Error ? err.message : 'Unable to check your session') }
      finally { if (current) setChecking(false) }
    }
    const expired = () => { setUser(null); setError('Your session has expired. Please sign in again.') }
    window.addEventListener('crisisroute:session-expired', expired)
    void check()
    return () => { current = false; window.removeEventListener('crisisroute:session-expired', expired) }
  }, [retry])

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const result: { access_token: string; user: ResponderUser } = await (await apiFetch(`${API_BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim(), password }) })).json()
      setSessionToken(result.access_token); setPassword(''); setUser(result.user)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in') }
    finally { setBusy(false) }
  }
  async function logout() {
    setBusy(true)
    try { await apiFetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' }); setError('') }
    catch { setError('Signed out on this device. The server could not confirm session revocation.') }
    finally { setSessionToken(null); setUser(null); setBusy(false) }
  }
  if (user) return children(user, logout)
  return <main className="auth-page"><section className="auth-card">
    <div className="brand-icon">CR</div><h1>CrisisRoute</h1><p>Responder Command Center</p>
    {checking ? <p role="status">Checking access…</p> : setupRequired ? <>
      <h2>Create the first administrator</h2>
      <p>A local administrator must create the first account on the backend computer. From the project folder, run this PowerShell command and choose a password of at least 12 characters.</p>
      <code className="setup-command">.\scripts\New-CrisisRouteAdmin.ps1 -Username admin -DisplayName "Administrator"</code>
      <p className="sync-note">If the backend uses a custom database, add <code>-DatabasePath</code> with the same path used when starting it. The script uses this project’s installed Python environment.</p>
      <button className="btn-action confirm" onClick={() => { setError(''); setChecking(true); setRetry(value => value + 1) }}>Check setup again</button>
    </> : <form onSubmit={login} className="feature-form">
      <h2>Sign in to respond</h2>
      <label>Username<input className="input-field" autoComplete="username" required maxLength={80} value={username} onChange={event => setUsername(event.target.value)} /></label>
      <label>Password<input className="input-field" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button className="btn-action confirm" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="sync-note">Ask your administrator for an account. Your role determines which actions you can take.</p>
    </form>}
    {error && <p className="error-state" role="alert">{error}</p>}
    {!checking && error && <button className="btn-open-report" onClick={() => { setError(''); setChecking(true); setRetry(value => value + 1) }}>Retry connection</button>}
  </section></main>
}
