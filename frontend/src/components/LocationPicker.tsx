import React, { useState } from 'react';
import { useLocationContext, formatCoordinates } from '../context/LocationContext';

export const LocationPicker: React.FC = () => {
  const {
    locationData,
    isCustomLocationSet,
    gpsStatus,
    gpsErrorMessage,
    gpsAccuracy,
    requestCurrentLocation,
    setManualAddressText,
    setSelectedCoordinates,
  } = useLocationContext();

  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [manualInputError, setManualInputError] = useState<string | null>(null);

  const handleManualAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualAddress.trim()) {
      setManualInputError('Please enter an address or landmark');
      return;
    }
    setManualAddressText(manualAddress.trim());
    setManualInputError(null);
    setIsManualInputOpen(false);
  };

  const handleManualCoordsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const latNum = parseFloat(manualLat);
    const lngNum = parseFloat(manualLng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setManualInputError('Latitude must be a valid number between -90 and 90');
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setManualInputError('Longitude must be a valid number between -180 and 180');
      return;
    }

    setSelectedCoordinates({ lat: latNum, lng: lngNum }, 'manual');
    setManualInputError(null);
    setIsManualInputOpen(false);
  };

  return (
    <div className="location-picker-card">
      <div className="location-header-row">
        <div className="location-title-group">
          <span className="location-badge">
            {locationData.source === 'gps' && 'GPS Verified'}
            {locationData.source === 'map_click' && 'Map Pinpoint'}
            {locationData.source === 'manual' && 'Manual Entry'}
            {locationData.source === 'default' && 'Unset / Default'}
          </span>
          <h3 className="location-title">Incident Location</h3>
        </div>

        <div className="location-actions-group">
          <button
            type="button"
            className="btn btn-primary btn-gps"
            onClick={requestCurrentLocation}
            disabled={gpsStatus === 'loading'}
            aria-label="Use device GPS location"
          >
            {gpsStatus === 'loading' ? (
              <span className="btn-loading">
                <span className="spinner-sm" /> Detecting location...
              </span>
            ) : (
              <span>📍 Use My Current Location</span>
            )}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsManualInputOpen(!isManualInputOpen)}
            aria-expanded={isManualInputOpen}
          >
            {isManualInputOpen ? 'Hide Manual Entry' : 'Manual Address / Coords'}
          </button>
        </div>
      </div>

      {/* Geolocation Feedback Messages */}
      {gpsStatus === 'loading' && (
        <div className="alert alert-info" role="status">
          <strong>Acquiring GPS:</strong> Please grant location permissions if prompted by your browser...
        </div>
      )}

      {gpsStatus === 'denied' && (
        <div className="alert alert-warning" role="alert">
          <strong>Location Notice:</strong> {gpsErrorMessage || 'Location access was not available. You can select your location manually on the map.'}
        </div>
      )}

      {gpsStatus === 'error' && (
        <div className="alert alert-danger" role="alert">
          <strong>Location Error:</strong> {gpsErrorMessage || 'Unable to detect your position. Please click on the map to set your location.'}
        </div>
      )}

      {/* Current Active Location Display */}
      <div className="location-details-box">
        <div className="location-detail-item">
          <span className="detail-label">Location Description:</span>
          <span className="detail-value">{locationData.address}</span>
        </div>

        <div className="location-coordinates-row">
          <div className="location-coord-chip">
            <span className="chip-label">Coordinates:</span>
            <code className="chip-code">
              {formatCoordinates(locationData.coordinates.lat, locationData.coordinates.lng)}
            </code>
          </div>

          {gpsAccuracy && locationData.source === 'gps' && (
            <div className="location-coord-chip">
              <span className="chip-label">Accuracy:</span>
              <span className="chip-val">&plusmn;{Math.round(gpsAccuracy)} meters</span>
            </div>
          )}

          <div className="location-coord-chip">
            <span className="chip-label">Status:</span>
            <span className={isCustomLocationSet ? 'status-tag tag-set' : 'status-tag tag-default'}>
              {isCustomLocationSet ? 'Location Specified' : 'Needs Selection'}
            </span>
          </div>
        </div>
      </div>

      {/* Manual Input Fallback Form */}
      {isManualInputOpen && (
        <div className="manual-location-panel">
          <h4 className="manual-panel-title">Enter Location Manually</h4>
          <p className="manual-panel-subtitle">
            If GPS is unavailable or you are requesting assistance for another location, type the address or exact coordinates below:
          </p>

          <form onSubmit={handleManualAddressSubmit} className="manual-form">
            <label htmlFor="manual-address-input" className="form-label">
              Street Address, Landmark, or Shelter Name:
            </label>
            <div className="input-group">
              <input
                id="manual-address-input"
                type="text"
                placeholder="e.g. Community Center, 45 Flood Relief Road"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                className="form-input"
              />
              <button type="submit" className="btn btn-secondary">
                Set Address
              </button>
            </div>
          </form>

          <div className="manual-divider">
            <span>or enter coordinates</span>
          </div>

          <form onSubmit={handleManualCoordsSubmit} className="manual-coords-form">
            <div className="coords-inputs-row">
              <div className="coord-field">
                <label htmlFor="manual-lat-input" className="form-label">
                  Latitude:
                </label>
                <input
                  id="manual-lat-input"
                  type="text"
                  placeholder="e.g. 12.9716"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="coord-field">
                <label htmlFor="manual-lng-input" className="form-label">
                  Longitude:
                </label>
                <input
                  id="manual-lng-input"
                  type="text"
                  placeholder="e.g. 77.5946"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="coord-btn-container">
                <button type="submit" className="btn btn-secondary">
                  Set Coords
                </button>
              </div>
            </div>
          </form>

          {manualInputError && (
            <p className="form-error-text" role="alert">
              {manualInputError}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
