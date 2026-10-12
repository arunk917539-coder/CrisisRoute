import { useEffect, useState } from 'react';
import { checkBackendHealth } from '../services/api';

export function useConnectionStatus() {
  const [state, setState] = useState<'checking' | 'online' | 'offline' | 'unreachable'>(navigator.onLine ? 'checking' : 'offline');
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const check = async () => {
      if (!navigator.onLine) { setState('offline'); return; }
      if (inFlight) return;
      inFlight = true;
      const result = await checkBackendHealth();
      if (active) setState(!navigator.onLine ? 'offline' : result.isOnline ? 'online' : 'unreachable');
      inFlight = false;
    };
    void check();
    const changed = () => { void check(); };
    window.addEventListener('online', changed);
    window.addEventListener('offline', changed);
    const timer = window.setInterval(changed, 10000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('online', changed); window.removeEventListener('offline', changed); };
  }, []);
  return state;
}
