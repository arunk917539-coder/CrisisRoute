import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPublicRequest } from '../services/api';
import { PublicRequestResponse } from '../types';

export const TrackRequestPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [trackingCode, setTrackingCode] = useState(searchParams.get('id') || '');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [requestData, setRequestData] = useState<PublicRequestResponse | null>(null);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      setTrackingCode(id);
      fetchRequest(id);
    }
  }, [searchParams]);

  const fetchRequest = async (idToSearch: string) => {
    if (!idToSearch.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMsg(null);

    // We intentionally don't clear requestData here so the UI doesn't flash empty while refreshing

    // Update URL without reloading
    if (searchParams.get('id') !== idToSearch) {
      setSearchParams({ id: idToSearch });
    }

    const result = await getPublicRequest(idToSearch.trim());

    if (result.success && result.request) {
      setRequestData(result.request);
    } else {
      setRequestData(null);
      if (result.errorMessage?.toLowerCase().includes('failed to fetch') || result.errorMessage?.toLowerCase().includes('network error')) {
        setErrorMsg('Network error: Unable to reach the server. Please check your connection and try again.');
      } else {
        setErrorMsg(result.errorMessage || 'Failed to retrieve request. Please ensure the Request ID is correct.');
      }
    }

    setIsLoading(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRequest(trackingCode);
  };

  const formatStatus = (status: string) => {
    switch (status) {
      case 'under_review':
        return 'Under Review';
      case 'verified':
        return 'Verified';
      case 'assigned':
        return 'Assigned / Scheduled';
      case 'in_progress':
        return 'In Progress / Out for Delivery';
      case 'resolved':
        return 'Resolved';
      default:
        return status.replace('_', ' ');
    }
  };

  const getStatusDescription = (status: string) => {
    switch (status) {
      case 'under_review':
        return 'Your request has been received and is currently being reviewed by response coordinators.';
      case 'verified':
        return 'Your request has been verified and added to the active response queue.';
      case 'assigned':
        return 'A response team has been assigned to address your situation.';
      case 'in_progress':
        return 'Help is on the way. The response team is currently in progress or out for delivery.';
      case 'resolved':
        return 'This request has been marked as resolved by the response team.';
      default:
        return 'Status is currently being updated.';
    }
  };

  const formatSubmittedAt = (submittedAt: string | null | undefined) => {
    if (!submittedAt) {
      return 'N/A';
    }

    // Backend timestamps are UTC. If the backend does not include
    // an explicit timezone suffix, treat the timestamp as UTC.
    const utcTimestamp = submittedAt.endsWith('Z')
      ? submittedAt
      : `${submittedAt}Z`;

    const date = new Date(utcTimestamp);

    if (Number.isNaN(date.getTime())) {
      return 'N/A';
    }

    // Convert to the user's browser-local timezone.
    return date.toLocaleString();
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
                <strong>Error:</strong> {errorMsg}
              </div>
              <div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => fetchRequest(trackingCode)}
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
                  🔒 Public Tracking Guarantee: Citizen status checks never expose internal responder reconciliation or operational logs.
                </div>
              </div>
            </div>
          )}

          {requestData && (
            <div className="track-status-box mt-4">
              <div className="status-box-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <h4 style={{ marginBottom: '8px' }}>
                      Request Status:{' '}
                      <span className="status-badge capitalize">
                        {formatStatus(requestData.status)}
                      </span>
                    </h4>
                    <p style={{ color: 'var(--slate-600)', fontSize: '14px', margin: 0, maxWidth: '500px' }}>
                      {getStatusDescription(requestData.status)}
                    </p>
                  </div>

                  <button
                    onClick={() => fetchRequest(requestData.request_id)}
                    className="btn btn-secondary"
                    disabled={isLoading}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {isLoading ? 'Refreshing...' : 'Check Latest Status'}
                  </button>
                </div>

                <div className="preview-body mt-3">
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
                      {formatSubmittedAt(requestData.submitted_at)}
                    </span>
                  </div>
                </div>

                <div className="privacy-badge mt-4">
                  🔒 Public Tracking Guarantee: Citizen status checks never expose internal responder reconciliation or operational logs.
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
              If you have evacuated or moved to a different shelter, you will be able to file an updated location reference connected to your tracking ID.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

};
