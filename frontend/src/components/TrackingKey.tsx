import React, { useState } from 'react';

export const TrackingKey: React.FC<{ token: string; saved?: boolean }> = ({ token, saved }) => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const copyKey = async () => {
    try { await navigator.clipboard.writeText(token); setMessage('Access key copied.'); }
    catch { setVisible(true); setMessage('Select and copy the access key below. Clipboard access is unavailable here.'); }
  };
  return <div className="access-key-card">
    <h4>Your private access key</h4>
    <p>Save this key with your request ID. It opens your details, responder questions, and photos on another device. Anyone with both can access your request.</p>
    <input aria-label="Request access key" className="form-input" type={visible ? 'text' : 'password'} value={token} readOnly autoComplete="off" spellCheck={false} />
    <div className="feature-actions">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVisible(value => !value)}>{visible ? 'Hide key' : 'Show key'}</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => { void copyKey(); }}>Copy key</button>
    </div>
    <p className="form-helper">{saved === false ? 'This browser could not save the key. Copy it before leaving this page.' : 'This browser remembers the key. Clearing browser data removes its saved copy.'} There is no citizen account or automatic key recovery.</p>
    {message && <p role="status" className="form-helper">{message}</p>}
  </div>;
};
