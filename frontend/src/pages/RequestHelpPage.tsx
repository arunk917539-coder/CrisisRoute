import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLocationContext, formatCoordinates } from '../context/LocationContext';
import { MapView } from '../components/MapView';
import { ReportType, CitizenReportDraft } from '../types';
import { getCitizenApiStatus } from '../services/api';

export const RequestHelpPage: React.FC = () => {
  const {
    locationData,
    isCustomLocationSet,
    currentGpsCoordinates,
    gpsAccuracy,
    setSelectedCoordinates,
  } = useLocationContext();

  const apiStatus = getCitizenApiStatus();

  // Form State matching backend ReportCreate contract
  const [reportType, setReportType] = useState<ReportType>('relief');
  const [category, setCategory] = useState<string>('food');
  const [description, setDescription] = useState<string>('');
  const [locationText, setLocationText] = useState<string>(locationData.address);
  const [peopleAffected, setPeopleAffected] = useState<string>('1');
  const [requiredQuantity, setRequiredQuantity] = useState<string>('5');
  const [evidenceStatus, setEvidenceStatus] = useState<'none' | 'photo' | 'document' | 'other'>('none');
  const [evidenceSource, setEvidenceSource] = useState<string>('Citizen direct report');
  const [evidenceNote, setEvidenceNote] = useState<string>('');

  // UI state
  const [validationError, setValidationError] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<CitizenReportDraft | null>(null);
  const [isSubmittedStaged, setIsSubmittedStaged] = useState<boolean>(false);

  // Sync location text if locationData updates from context
  useEffect(() => {
    if (locationData.address) {
      setLocationText(locationData.address);
    }
  }, [locationData.address]);

  // Adjust quantity default based on report type
  const handleReportTypeChange = (type: ReportType) => {
    setReportType(type);
    if (type === 'emergency') {
      setRequiredQuantity('0');
      if (category === 'food' || category === 'water') {
        setCategory('rescue');
      }
    } else {
      if (requiredQuantity === '0') {
        setRequiredQuantity('5');
      }
      if (category === 'rescue') {
        setCategory('food');
      }
    }
  };

  const validateForm = (): CitizenReportDraft | null => {
    const desc = description.trim();
    const loc = locationText.trim();
    const people = parseInt(peopleAffected, 10);
    const qty = parseFloat(requiredQuantity);

    if (loc.length < 2) {
      setValidationError('Please specify a location (at least 2 characters) or select one on the map.');
      return null;
    }
    if (desc.length < 5) {
      setValidationError('Please provide a description of the situation (at least 5 characters).');
      return null;
    }
    if (isNaN(people) || people < 0) {
      setValidationError('People affected must be 0 or greater.');
      return null;
    }
    if (reportType === 'relief' && (isNaN(qty) || qty <= 0)) {
      setValidationError('Relief requests require a positive quantity needed (e.g. food packets, water bottles).');
      return null;
    }
    if (reportType === 'emergency' && qty !== 0) {
      setValidationError('Emergency rescue reports must have quantity set to 0 as per response guidelines.');
      return null;
    }

    setValidationError(null);

    return {
      report_type: reportType,
      category: category.trim(),
      description: desc,
      location: loc,
      latitude: isCustomLocationSet ? locationData.coordinates.lat : null,
      longitude: isCustomLocationSet ? locationData.coordinates.lng : null,
      people_affected: people,
      required_quantity: reportType === 'emergency' ? 0 : qty,
      evidence_status: evidenceStatus,
      evidence_source: evidenceSource.trim() || 'Citizen direct report',
      evidence_note: evidenceNote.trim(),
    };
  };

  const handlePreview = (e: React.FormEvent) => {
    e.preventDefault();
    const draft = validateForm();
    if (draft) {
      setPreviewDraft(draft);
      setIsSubmittedStaged(false);
    }
  };

  const handleStageSubmit = () => {
    const draft = validateForm();
    if (!draft) return;

    // We do NOT dispatch to internal admin /reports endpoints.
    // Instead we confirm the draft is staged locally and indicate the Batch 2 API state.
    setPreviewDraft(draft);
    setIsSubmittedStaged(true);
  };

  return (
    <div className="request-help-page">
      <div className="container form-page-container">
        {/* Breadcrumb / Back link */}
        <div className="page-nav-back">
          <Link to="/" className="back-link">
            &larr; Back to Emergency Home
          </Link>
        </div>

        <div className="page-header">
          <span className="section-badge">Citizen Intake</span>
          <h1 className="page-title">Request Emergency or Relief Help</h1>
          <p className="page-subtitle">
            Provide details about your situation so relief teams can assess priority, bundle required supplies,
            and coordinate field response.
          </p>
        </div>

        {/* API Staging Advisory */}
        <div className="alert alert-info staging-banner" role="status">
          <div className="alert-content">
            <strong>System Notice:</strong> Public citizen report submission pipeline is currently in staging (Batch 1 foundation).
            You can compose and preview your request draft below. Requests will NOT be sent to responder-internal endpoints until the verified citizen intake API is activated.
          </div>
        </div>

        <div className="request-grid">
          {/* Main Request Form */}
          <div className="form-main-col">
            <form onSubmit={handlePreview} className="citizen-form" noValidate>
              {/* Request Type Selector */}
              <div className="form-section-card">
                <h3 className="card-heading">1. Select Request Type</h3>
                <div className="type-selector-grid">
                  <label
                    className={`type-radio-card ${reportType === 'relief' ? 'type-card-active' : ''}`}
                    onClick={() => handleReportTypeChange('relief')}
                  >
                    <input
                      type="radio"
                      name="report_type"
                      value="relief"
                      checked={reportType === 'relief'}
                      onChange={() => handleReportTypeChange('relief')}
                      className="sr-only"
                    />
                    <div className="type-card-content">
                      <span className="type-icon">📦</span>
                      <strong className="type-title">Relief Supplies</strong>
                      <span className="type-desc">Food, clean drinking water, blankets, medicine, or shelter items.</span>
                    </div>
                  </label>

                  <label
                    className={`type-radio-card ${reportType === 'emergency' ? 'type-card-active' : ''}`}
                    onClick={() => handleReportTypeChange('emergency')}
                  >
                    <input
                      type="radio"
                      name="report_type"
                      value="emergency"
                      checked={reportType === 'emergency'}
                      onChange={() => handleReportTypeChange('emergency')}
                      className="sr-only"
                    />
                    <div className="type-card-content">
                      <span className="type-icon">🚨</span>
                      <strong className="type-title">Urgent Emergency</strong>
                      <span className="type-desc">Immediate rescue, trapped individuals, flood danger, evacuation.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Category & Need */}
              <div className="form-section-card">
                <h3 className="card-heading">2. Category &amp; Needs</h3>
                <div className="form-group">
                  <label htmlFor="category-select" className="form-label">
                    Primary Category <span className="req-star">*</span>
                  </label>
                  <select
                    id="category-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="form-input form-select"
                  >
                    {reportType === 'relief' ? (
                      <>
                        <option value="food">Food &amp; Nutrition Packs</option>
                        <option value="water">Potable Drinking Water</option>
                        <option value="medical">Basic Medical &amp; First Aid</option>
                        <option value="shelter">Tarps &amp; Temporary Shelter</option>
                        <option value="clothing">Blankets &amp; Warm Clothing</option>
                        <option value="sanitation">Sanitation &amp; Hygiene Kits</option>
                      </>
                    ) : (
                      <>
                        <option value="rescue">Search &amp; Rescue</option>
                        <option value="medical_trauma">Critical Medical Trauma</option>
                        <option value="evacuation">Urgent Flood/Fire Evacuation</option>
                        <option value="structural_hazard">Building Collapse / Hazard</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label htmlFor="people-affected" className="form-label">
                      Number of People Affected <span className="req-star">*</span>
                    </label>
                    <input
                      id="people-affected"
                      type="number"
                      min="0"
                      value={peopleAffected}
                      onChange={(e) => setPeopleAffected(e.target.value)}
                      className="form-input"
                      placeholder="e.g. 4"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="required-qty" className="form-label">
                      {reportType === 'relief' ? 'Required Quantity (Packs/Units)' : 'Required Quantity'} <span className="req-star">*</span>
                    </label>
                    <input
                      id="required-qty"
                      type="number"
                      min={reportType === 'relief' ? '1' : '0'}
                      disabled={reportType === 'emergency'}
                      value={reportType === 'emergency' ? '0' : requiredQuantity}
                      onChange={(e) => setRequiredQuantity(e.target.value)}
                      className="form-input"
                      placeholder={reportType === 'relief' ? 'e.g. 10' : '0 (Not applicable for emergency)'}
                    />
                    {reportType === 'emergency' && (
                      <small className="form-helper">Emergency requests do not use unit counts.</small>
                    )}
                  </div>
                </div>
              </div>

              {/* Location Information */}
              <div className="form-section-card">
                <div className="card-heading-row">
                  <h3 className="card-heading">3. Location Information</h3>
                  <Link to="/" className="link-action">
                    Change Pin on Map &rarr;
                  </Link>
                </div>

                <div className="form-group">
                  <label htmlFor="report-location-text" className="form-label">
                    Location Description or Address <span className="req-star">*</span>
                  </label>
                  <input
                    id="report-location-text"
                    type="text"
                    value={locationText}
                    onChange={(e) => setLocationText(e.target.value)}
                    className="form-input"
                    placeholder="Enter street, landmark, building, or village name"
                  />
                </div>

                <div className="location-pin-preview">
                  <span className="pin-preview-icon">📍</span>
                  <div className="pin-preview-text">
                    <strong>Pinned Coordinates:</strong>{' '}
                    <code>
                      {isCustomLocationSet
                        ? formatCoordinates(locationData.coordinates.lat, locationData.coordinates.lng)
                        : 'No coordinates pinned yet'}
                    </code>
                    {isCustomLocationSet && (
                      <span className="source-tag">({locationData.source})</span>
                    )}
                  </div>
                </div>

                <div className="form-map-preview-container mt-3">
                  <MapView
                    selectedCoordinates={locationData.coordinates}
                    gpsCoordinates={currentGpsCoordinates}
                    isCustomLocationSet={isCustomLocationSet}
                    address={locationData.address}
                    source={locationData.source}
                    gpsAccuracy={gpsAccuracy}
                    onSelectLocation={(coords) => setSelectedCoordinates(coords, 'map_click')}
                    height="260px"
                    zoomLevel={15}
                  />
                </div>
              </div>

              {/* Situation Description */}
              <div className="form-section-card">
                <h3 className="card-heading">4. Situation Description</h3>
                <div className="form-group">
                  <label htmlFor="description-input" className="form-label">
                    Describe your urgent situation <span className="req-star">*</span>
                  </label>
                  <textarea
                    id="description-input"
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="form-input form-textarea"
                    placeholder="Please include details such as current road access, visible hazards, specific medical conditions, or urgency..."
                  />
                  <small className="form-helper">Minimum 5 characters. Be clear and specific.</small>
                </div>
              </div>

              {/* Supporting Evidence / Context */}
              <div className="form-section-card">
                <h3 className="card-heading">5. Supporting Context (Optional)</h3>
                <div className="form-group">
                  <label htmlFor="evidence-status-select" className="form-label">
                    Supporting Verification Context
                  </label>
                  <select
                    id="evidence-status-select"
                    value={evidenceStatus}
                    onChange={(e) => setEvidenceStatus(e.target.value as any)}
                    className="form-input form-select"
                  >
                    <option value="none">No supporting file / Direct verbal report</option>
                    <option value="photo">Photo available with requester</option>
                    <option value="document">Official identity / camp document</option>
                    <option value="other">Other contextual evidence</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="evidence-note-input" className="form-label">
                    Context Note (Optional)
                  </label>
                  <textarea
                    id="evidence-note-input"
                    rows={2}
                    value={evidenceNote}
                    onChange={(e) => setEvidenceNote(e.target.value)}
                    className="form-input form-textarea"
                    placeholder="Optional notes regarding observation time, landmark details, or contact method..."
                  />
                </div>
              </div>

              {/* Validation Feedback */}
              {validationError && (
                <div className="alert alert-danger" role="alert">
                  <strong>Please correct:</strong> {validationError}
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="form-actions-card">
                <button type="submit" className="btn btn-secondary btn-lg">
                  Preview Request Draft
                </button>

                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={handleStageSubmit}
                >
                  Verify &amp; Stage Request
                </button>
              </div>
            </form>
          </div>

          {/* Sidebar / Preview Column */}
          <div className="form-sidebar-col">
            {previewDraft ? (
              <div className="preview-card">
                <div className="preview-header">
                  <span className="badge-preview">Request Draft Preview</span>
                  <h4>{previewDraft.report_type.toUpperCase()} REQUEST</h4>
                </div>

                <div className="preview-body">
                  <div className="preview-item">
                    <span className="preview-label">Category:</span>
                    <span className="preview-val capitalize">{previewDraft.category}</span>
                  </div>

                  <div className="preview-item">
                    <span className="preview-label">People Affected:</span>
                    <span className="preview-val">{previewDraft.people_affected}</span>
                  </div>

                  {previewDraft.report_type === 'relief' && (
                    <div className="preview-item">
                      <span className="preview-label">Required Quantity:</span>
                      <span className="preview-val">{previewDraft.required_quantity} units</span>
                    </div>
                  )}

                  <div className="preview-item">
                    <span className="preview-label">Location:</span>
                    <span className="preview-val">{previewDraft.location}</span>
                  </div>

                  <div className="preview-item">
                    <span className="preview-label">Coordinates:</span>
                    <code className="preview-code">
                      {previewDraft.latitude !== null && previewDraft.longitude !== null
                        ? formatCoordinates(previewDraft.latitude, previewDraft.longitude)
                        : 'Not specified'}
                    </code>
                  </div>

                  <div className="preview-item">
                    <span className="preview-label">Description:</span>
                    <p className="preview-desc">{previewDraft.description}</p>
                  </div>

                  {previewDraft.evidence_status !== 'none' && (
                    <div className="preview-item">
                      <span className="preview-label">Evidence:</span>
                      <span className="preview-val">{previewDraft.evidence_status}</span>
                    </div>
                  )}
                </div>

                {isSubmittedStaged ? (
                  <div className="staged-success-notice">
                    <div className="notice-icon">📋</div>
                    <h5>Request Draft Prepared</h5>
                    <p>
                      Your crisis assistance draft has been compiled locally with verified schema fields.
                      As part of Batch 1 separation, live submission will hook into the dedicated citizen endpoint in Batch 2.
                    </p>
                    <small>No unverified data was sent to internal responder queues.</small>
                  </div>
                ) : (
                  <div className="preview-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      onClick={handleStageSubmit}
                    >
                      Stage This Draft
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="help-info-card">
                <h4 className="info-title">Need Help Guidance</h4>
                <ul className="info-points">
                  <li>
                    <strong>Be Specific:</strong> Mention any children, elderly individuals, or people requiring urgent medications.
                  </li>
                  <li>
                    <strong>Keep Coordinates Accurate:</strong> Help responders find you even if street signs are down.
                  </li>
                  <li>
                    <strong>Safe Submission:</strong> Your data will only be seen by authorized aid coordinators.
                  </li>
                </ul>

                <div className="info-emergency-alert">
                  <strong>Life Threatening Emergency?</strong>
                  <p>Do not wait for form processing. Call local emergency numbers immediately.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
