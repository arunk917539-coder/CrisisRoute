import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLocationContext, formatCoordinates } from '../context/LocationContext';
import { MapView } from '../components/MapView';
import { LocationPicker } from '../components/LocationPicker';
import { ReportType, Priority, CitizenReportDraft, PublicReportPayload } from '../types';
import { createPublicReport } from '../services/api';

export const RequestHelpPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    locationData,
    isCustomLocationSet,
    currentGpsCoordinates,
    gpsAccuracy,
    setSelectedCoordinates,
  } = useLocationContext();

  // Form State matching backend ReportCreate contract
  const [reportType, setReportType] = useState<ReportType>('relief');
  const [category, setCategory] = useState<string>('food');
  const [description, setDescription] = useState<string>('');
  const [locationText, setLocationText] = useState<string>(locationData.address);
  const [peopleAffected, setPeopleAffected] = useState<string>('1');
  const [requiredQuantity, setRequiredQuantity] = useState<string>('5');
  const [priority, setPriority] = useState<Priority>('medium');
  const [evidenceNote, setEvidenceNote] = useState<string>('');

  // UI state
  const [validationError, setValidationError] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<CitizenReportDraft | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedRequestId, setSubmittedRequestId] = useState<string | null>(null);
  const submissionInFlight = useRef(false);
  const locationWasEdited = useRef(false);
  const selectedPoint = `${locationData.coordinates.lat},${locationData.coordinates.lng}`;
  const previousPoint = useRef(selectedPoint);

  // Sync location text if locationData updates from context
  useEffect(() => {
    if (previousPoint.current !== selectedPoint) {
      locationWasEdited.current = false;
      previousPoint.current = selectedPoint;
    }
    if (locationData.address && !locationWasEdited.current) {
      setLocationText(locationData.address.slice(0, 200));
    }
  }, [locationData.address, selectedPoint]);

  // Adjust quantity default based on report type
  const handleReportTypeChange = (type: ReportType) => {
    if (type === reportType) return;
    setReportType(type);
    if (type === 'emergency') {
      setPriority('critical');
      setRequiredQuantity('0');
      setCategory('rescue');
    } else {
      setPriority('medium');
      if (requiredQuantity === '0') {
        setRequiredQuantity('5');
      }
      setCategory('food');
    }
  };

  const validateForm = (): CitizenReportDraft | null => {
    const desc = description.trim();
    const loc = locationText.trim();
    const people = Number(peopleAffected);
    const qty = Number(requiredQuantity);

    if (loc.length < 2 || loc.length > 200) {
      setValidationError('Please specify a location between 2 and 200 characters.');
      return null;
    }

    if (!isCustomLocationSet) {
      setValidationError(
        'Please pin your exact location using GPS, the map, address search, or manual coordinates before submitting.'
      );
      return null;
    }
    if (desc.length < 5 || desc.length > 500) {
      setValidationError('Please describe the situation in 5 to 500 characters.');
      return null;
    }
    if (!peopleAffected.trim() || !Number.isSafeInteger(people) || people < 0 || people > 10_000_000) {
      setValidationError('People affected must be a whole number from 0 to 10,000,000.');
      return null;
    }
    if (reportType === 'relief' && (!Number.isFinite(qty) || qty <= 0 || qty > 1_000_000_000)) {
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
      priority,
      evidence_note: evidenceNote.trim(),
    };
  };

  const handlePreview = (e: React.FormEvent) => {
    e.preventDefault();
    const draft = validateForm();
    if (draft) {
      setPreviewDraft(draft);
    }
  };

  const handleSubmitRequest = async () => {
    if (submissionInFlight.current) return;

    const draft = validateForm();
    if (!draft) return;

    submissionInFlight.current = true;
    setPreviewDraft(draft);
    setIsSubmitting(true);
    setValidationError(null);

    const payload: PublicReportPayload = {
      report_type: draft.report_type,
      category: draft.category,
      description: draft.description,
      location: draft.location,
      latitude: draft.latitude,
      longitude: draft.longitude,
      people_affected: draft.people_affected,
      required_quantity: draft.required_quantity,
      priority: draft.priority,
      evidence_note: draft.evidence_note,
    };

    const result = await createPublicReport(payload);

    if (result.success) {
      setSubmittedRequestId(result.request.request_id);
    } else {
      setValidationError(result.errorMessage);
    }

    setIsSubmitting(false);
    submissionInFlight.current = false;
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

        {submittedRequestId ? (
          <div className="success-state-container text-center mt-5" style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid var(--slate-200)', boxShadow: 'var(--shadow-md)' }}>
            <div className="notice-icon" style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
            <h2 style={{ fontSize: '28px', color: 'var(--success-700)', marginBottom: '8px' }}>Request Successfully Created</h2>
            <p style={{ fontSize: '16px', color: 'var(--slate-600)', marginBottom: '24px' }}>
              Your request has been saved to the shared backend and is waiting for human review.
            </p>

            <div className="request-id-display" style={{ backgroundColor: 'var(--slate-50)', padding: '20px', borderRadius: '8px', border: '1px dashed var(--slate-300)', marginBottom: '24px' }}>
              <span className="request-id-label" style={{ display: 'block', fontSize: '14px', color: 'var(--slate-500)', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>Your Request ID</span>
              <strong className="request-id-val" style={{ fontSize: '32px', color: 'var(--slate-900)', letterSpacing: '1px' }}>{submittedRequestId}</strong>
            </div>

            <p style={{ fontSize: '14px', color: 'var(--slate-500)', marginBottom: '32px' }}>
              Please save this ID to follow review and delivery updates. Tracking refreshes every five seconds.
            </p>

            <div className="preview-actions" style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => navigate(`/track?id=${submittedRequestId}`)}
              >
                Track Request Status
              </button>
              <Link to="/" className="btn btn-secondary btn-lg">
                Return to Home
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="page-header">
              <span className="section-badge">Citizen Intake</span>
              <h1 className="page-title">Request Emergency or Relief Help</h1>
              <p className="page-subtitle">
                Provide details about your situation so relief teams can assess priority, bundle required supplies,
                and coordinate field response.
              </p>
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
                          max="10000000"
                          step="1"
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
                          max="1000000000"
                          step="any"
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
                    <div className="form-group">
                      <label htmlFor="priority-select" className="form-label">Urgency</label>
                      <select id="priority-select" className="form-input form-select" value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                      <small className="form-helper">Your assessment helps coordinators prioritize human review.</small>
                    </div>
                  </div>

                  {/* Location Information */}
                  <div className="form-section-card">
                    <div className="card-heading-row">
                      <h3 className="card-heading">3. Location Information</h3>
                    </div>

                    <LocationPicker embedded />

                    <div className="form-group">
                      <label htmlFor="report-location-text" className="form-label">
                        Location Description or Address <span className="req-star">*</span>
                      </label>
                      <input
                        id="report-location-text"
                        type="text"
                        maxLength={200}
                        value={locationText}
                        onChange={(e) => { locationWasEdited.current = true; setLocationText(e.target.value); }}
                        className="form-input"
                        placeholder="Enter street, landmark, building, or village name"
                      />
                      <small className="form-helper">
                        A map/GPS pin is required. Typing an address alone does not set your incident coordinates.
                      </small>
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
                        maxLength={500}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="form-input form-textarea"
                        placeholder="Please include details such as current road access, visible hazards, specific medical conditions, or urgency..."
                      />
                      <small className="form-helper">5 to 500 characters. Be clear and specific.</small>
                    </div>
                  </div>

                  {/* Supporting Evidence / Context */}
                  <div className="form-section-card">
                    <h3 className="card-heading">5. Supporting Context (Optional)</h3>
                    <div className="form-group">
                      <label htmlFor="evidence-note-input" className="form-label">
                        Context Note (Optional)
                      </label>
                      <textarea
                        id="evidence-note-input"
                        rows={2}
                        maxLength={1000}
                        value={evidenceNote}
                        onChange={(e) => setEvidenceNote(e.target.value)}
                        className="form-input form-textarea"
                        placeholder="Optional notes regarding observation time, landmark details, or contact method..."
                      />
                      <small className="form-helper">Sent as supporting text for responders to review. File upload is not available in this prototype.</small>
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
                    <button type="submit" className="btn btn-secondary btn-lg" disabled={isSubmitting}>
                      Preview Request Draft
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary btn-lg"
                      onClick={handleSubmitRequest}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Submitting...' : 'Submit Request'}
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
                        <span className="preview-label">Urgency:</span>
                        <span className="preview-val capitalize">{previewDraft.priority}</span>
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

                      {previewDraft.evidence_note && (
                        <div className="preview-item">
                          <span className="preview-label">Supporting context:</span>
                          <span className="preview-val">{previewDraft.evidence_note}</span>
                        </div>
                      )}
                    </div>

                    <div className="preview-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-block"
                        onClick={handleSubmitRequest}
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? 'Submitting...' : 'Submit Request'}
                      </button>
                    </div>
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
                        <strong>Demo Data:</strong> Use synthetic details in this hackathon prototype. Request IDs are public tracking references.
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
          </>
        )}
      </div>
    </div>
  );

};
