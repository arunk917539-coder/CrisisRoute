import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export const TrackRequestPage: React.FC = () => {
  const [trackingCode, setTrackingCode] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingCode.trim()) return;
    setHasSearched(true);
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
            Check the verification and dispatch status of your submitted emergency or relief request.
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
                placeholder="e.g. CR-2026-XXXX"
                value={trackingCode}
                onChange={(e) => {
                  setTrackingCode(e.target.value);
                  setHasSearched(false);
                }}
                className="form-input"
              />
              <button type="submit" className="btn btn-primary">
                Search Status
              </button>
            </div>
            <small className="form-helper">
              Your tracking code is generated upon successful submission of a citizen report.
            </small>
          </form>

          {/* Staging / Placeholder Notice */}
          <div className="track-status-box">
            <div className="status-box-icon">⏳</div>
            <div className="status-box-content">
              <h4>Public Tracking System In Staging</h4>
              <p>
                As part of the Citizen Batch 1 architecture, the tracking portal structure is prepared.
                Live tracking will activate once citizen request submissions are connected to the verified public pipeline.
              </p>
              <div className="privacy-badge">
                🔒 Public Tracking Guarantee: Citizen status checks never expose internal responder reconciliation or operational logs.
              </div>
            </div>
          </div>

          {hasSearched && (
            <div className="alert alert-warning mt-4" role="status">
              <strong>Tracking Code Staging:</strong> Code <code>{trackingCode}</code> was received.
              Live query lookups will connect to the citizen tracking backend in Batch 2.
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
              If you have evacuated or moved to a different shelter, you will be able to file an updated location reference connected to your tracking ID.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
