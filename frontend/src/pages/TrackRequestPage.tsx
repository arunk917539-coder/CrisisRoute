import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPublicRequest } from '../services/api';
import { PublicRequestResponse } from '../types';
import { formatTimestamp, statusLabel, statusDescription } from '../utils/publicRequest';

export const TrackRequestPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [trackingCode, setTrackingCode] = useState(searchParams.get('id') || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [requestData, setRequestData] = useState<PublicRequestResponse | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const requestId = (searchParams.get('id') || '').trim().toUpperCase();

  useEffect(() => {
    setTrackingCode(requestId);
    setRequestData((previous) => previous?.request_id === requestId ? previous : null);
    setLastChecked(null);
    setErrorMsg(null);
    setIsLoading(false);
    if (!requestId) return;
    if (!/^CR-[1-9]\d*$/.test(requestId)) {
      setErrorMsg('Enter a valid request ID, such as CR-1.');
      return;
    }

    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setIsLoading(true);
      const result = await getPublicRequest(requestId, controller.signal);
      if (!active) return;
      if (result.success && result.request) {
        setRequestData(result.request);
        setErrorMsg(null);
        setLastChecked(new Date().toLocaleTimeString());
      } else {
        setErrorMsg(result.errorMessage || 'Unable to check the latest status. Retrying automatically.');
      }
      inFlight = false;
      setIsLoading(false);
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [requestId, refreshCount]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = trackingCode.trim().toUpperCase();
    if (normalized === requestId) setRefreshCount((count) => count + 1);
    else setSearchParams({ id: normalized });
  };

  return (
    <div className="track-page">
      <div className="container track-container">
        <div className="page-nav-back">
          <Link to="/" className="back-link">
            &larr; Back to Emergency Home
          </Link>
        </div>

        <div className="track-header text-center">
          <span className="section-badge">Citizen Tracking</span>
          <h1 className="page-title">Track Your Assistance Request</h1>
          <p className="page-subtitle">
            Follow human review, supply allocation, and recorded delivery updates for your request.
          </p>
        </div>

        {/* Tracking Input Card */}
        <div className="track-card">
          <form onSubmit={handleSearch} className="track-search-form">
            <label htmlFor="tracking-code-input" className="form-label">
              Enter Your Request Reference Code:
            </label>

            <div className="input-group">
              <input
                id="tracking-code-input"
                type="text"
                placeholder="e.g. CR-1"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value)}
                className="form-input"
              />

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || !trackingCode.trim()}
              >
                {isLoading && !requestData ? 'Searching...' : 'Search Status'}
              </button>
            </div>

            <small className="form-helper">
              Your tracking code is generated upon successful submission of a citizen report.
            </small>
          </form>

          {errorMsg && (
            <div className="alert alert-danger mt-4" role="status" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <strong>{requestData ? 'Latest update unavailable:' : 'Error:'}</strong> {errorMsg}
                {requestData && <p>Showing the last successfully retrieved status. Automatic checks continue every five seconds.</p>}
              </div>
              <div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setRefreshCount((count) => count + 1)}
                  disabled={isLoading}
                  style={{ backgroundColor: '#fff' }}
                >
                  {isLoading ? 'Retrying...' : 'Retry Request'}
                </button>
              </div>
            </div>
          )}

          {!requestData && !errorMsg && !isLoading && (
            <div className="track-status-box mt-4">
              <div className="status-box-content">
                <h4>Check Request Status</h4>

                <p>
                  Enter your request reference code above to check the real-time status of your request.
                </p>

                <div className="privacy-badge mt-4">
                  Anyone with a request ID can view its public tracking details. Use synthetic information for the demo.
                </div>
              </div>
            </div>
          )}

          {requestData && (
            <div className="track-status-box mt-4" aria-live="polite">
              <div className="status-box-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <h4 style={{ marginBottom: '8px' }}>
                      Request Status:{' '}
                      <span className="status-badge capitalize">
                        {statusLabel(requestData.status)}
                      </span>
                    </h4>
                    <p style={{ color: 'var(--slate-600)', fontSize: '14px', margin: 0, maxWidth: '500px' }}>
                      {statusDescription(requestData.status)}
                    </p>
                  </div>

                  <button
                    onClick={() => setRefreshCount((count) => count + 1)}
                    className="btn btn-secondary"
                    disabled={isLoading}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {isLoading ? 'Refreshing...' : 'Check Latest Status'}
                  </button>
                </div>
                <p className="form-helper">Automatically checks every 5 seconds.{lastChecked ? ` Last checked at ${lastChecked}.` : ''}</p>

                <div className="preview-body mt-3">
                  <div className="preview-item">
                    <span className="preview-label">Urgency:</span>
                    <span className="preview-val capitalize">{requestData.priority}</span>
                  </div>

                  <div className="preview-item">
                    <span className="preview-label">Request ID:</span>
                    <span className="preview-val">
                      <strong>{requestData.request_id}</strong>
                    </span>
                  </div>

                  <div className="preview-item">
                    <span className="preview-label">Category:</span>
                    <span className="preview-val capitalize">
                      {requestData.category}
                    </span>
                  </div>

                  <div className="preview-item">
                    <span className="preview-label">Location:</span>
                    <span className="preview-val">
                      {requestData.location}
                    </span>
                  </div>

                  <div className="preview-item">
                    <span className="preview-label">Description:</span>
                    <p className="preview-desc">
                      {requestData.description}
                    </p>
                  </div>

                  <div className="preview-item">
                    <span className="preview-label">Submitted At:</span>
                    <span className="preview-val">
                      {formatTimestamp(requestData.submitted_at)}
                    </span>
                  </div>
                  <div className="preview-item">
                    <span className="preview-label">Last Update:</span>
                    <span className="preview-val">{formatTimestamp(requestData.updated_at)}</span>
                  </div>
                  {requestData.reviewed_at && <div className="preview-item">
                    <span className="preview-label">Human Review:</span>
                    <span className="preview-val">{formatTimestamp(requestData.reviewed_at)}</span>
                  </div>}
                  {requestData.review_note && <div className="preview-item">
                    <span className="preview-label">Responder Note:</span>
                    <p className="preview-desc">{requestData.review_note}</p>
                  </div>}
                </div>

                {requestData.coverage && <div className="form-section-card mt-4">
                  <h4>Verified supply need</h4>
                  <div className="preview-item"><span className="preview-label">Required:</span><strong>{requestData.coverage.verified_quantity} {requestData.coverage.unit}</strong></div>
                  <div className="preview-item"><span className="preview-label">Delivered:</span><strong>{requestData.coverage.delivered_quantity} {requestData.coverage.unit}</strong></div>
                  <div className="preview-item"><span className="preview-label">Remaining:</span><strong>{requestData.coverage.uncovered_quantity} {requestData.coverage.unit}</strong></div>
                  <div className="preview-item"><span className="preview-label">Allocated, awaiting delivery:</span><strong>{requestData.coverage.outstanding_allocated_quantity} {requestData.coverage.unit}</strong></div>
                  <p className="form-helper">{requestData.coverage.coverage_percent.toFixed(1)}% of the verified need has been delivered. Allocations do not count as completed deliveries.</p>
                </div>}

                <div className="privacy-badge mt-4">
                  Public tracking shows the responder's review note and delivery totals. Internal reconciliation and audit logs stay in the responder interface.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Informative Guidance */}
        <div className="track-faq-grid">
          <div className="faq-card">
            <h4>How does verification work?</h4>
            <p>
              When a request is submitted, response teams verify nearby needs to prevent duplicate relief drops and allocate active inventories efficiently.
            </p>
          </div>

          <div className="faq-card">
            <h4>What if my emergency situation worsens?</h4>
            <p>
              Do not wait for online tracking updates if you or someone nearby is in critical danger. Contact emergency services (911 / 112) immediately.
            </p>
          </div>

          <div className="faq-card">
            <h4>Can I update my location?</h4>
            <p>
              This prototype cannot edit submitted requests. Tell the coordinator your request ID and new location so they can review the change.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

};
