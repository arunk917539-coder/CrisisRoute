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
    setSelectedCoordinates,
    searchAddress,
  } = useLocationContext();

  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [addressSearchFeedback, setAddressSearchFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [coordsError, setCoordsError] = useState<string | null>(null);

  const handleAddressSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = addressQuery.trim();
    if (!query) {
      setAddressSearchFeedback({
        type: 'error',
        message: 'Please enter a location, town, street, or landmark name to search.',
      });
      return;
    }

    setIsSearchingAddress(true);
    setAddressSearchFeedback(null);

    const result = await searchAddress(query);
    setIsSearchingAddress(false);

    if (result.success) {
      setAddressSearchFeedback({
        type: 'success',
        message: `Found and centered map on: ${result.displayName || query}`,
      });
    } else {
      setAddressSearchFeedback({
        type: 'error',
        message: result.error || 'Location could not be found. Please try another name or click on the map.',
      });
    }
  };

  const handleManualCoordsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const latNum = parseFloat(manualLat);
    const lngNum = parseFloat(manualLng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setCoordsError('Latitude must be a valid number between -90 and 90');
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setCoordsError('Longitude must be a valid number between -180 and 180');
      return;
    }

    setSelectedCoordinates({ lat: latNum, lng: lngNum }, 'manual');
    setCoordsError(null);
    setAddressSearchFeedback({
      type: 'success',
      message: `Map centered on coordinates: ${latNum.toFixed(5)}, ${lngNum.toFixed(5)}`,
    });
  };

  const hasReadableAddress = Boolean(
    locationData.address &&
      locationData.address.trim().length > 0 &&
      locationData.address !== 'Selected map location'
  );

  return (
    <div className="location-picker-card">
      <div className="location-header-row">
        <div className="location-title-group">
          <span className="location-badge">
            {locationData.source === 'gps' && 'GPS Verified'}
            {locationData.source === 'map_click' && 'Map Pinpoint'}
            {locationData.source === 'address_search' && 'Address Resolved'}
            {locationData.source === 'manual' && 'Manual Coordinates'}
            {locationData.source === 'default' && 'Unset / Default'}
          </span>
          <h3 className="location-title">Location Selection</h3>
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
                <span className="spinner-sm" /> Detecting GPS...
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
            {isManualInputOpen ? 'Close Search / Coords' : 'Search Address / Coords'}
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
          <span className="detail-label">Incident Location:</span>
          <span className="detail-value">
            {isCustomLocationSet
              ? hasReadableAddress
                ? locationData.address
                : 'Selected map location'
              : 'No location selected yet'}
          </span>
        </div>

        <div className="location-coordinates-row">
          <div className="location-coord-chip">
            <span className="chip-label">Coordinates:</span>
            <code className="chip-code">
              {isCustomLocationSet
                ? formatCoordinates(locationData.coordinates.lat, locationData.coordinates.lng)
                : 'Not pinned'}
            </code>
          </div>

          {gpsAccuracy && locationData.source === 'gps' && (
            <div className="location-coord-chip">
              <span className="chip-label">GPS Accuracy:</span>
              <span className="chip-val">&plusmn;{Math.round(gpsAccuracy)}m</span>
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

      {/* Manual Input Fallback Form (Address Geocode & Direct Coordinates) */}
      {isManualInputOpen && (
        <div className="manual-location-panel">
          <h4 className="manual-panel-title">Search Address or Enter Coordinates</h4>
          <p className="manual-panel-subtitle">
            Search for an area name or enter exact GPS coordinates. Submitting will resolve the location and move the map marker automatically.
          </p>

          {/* Address Search Form */}
          <form onSubmit={handleAddressSearchSubmit} className="manual-form">
            <label htmlFor="address-search-input" className="form-label">
              Search Street, Landmark, or Area:
            </label>
            <div className="input-group">
              <input
                id="address-search-input"
                type="text"
                placeholder="e.g. Mangalore Central, Town Hall, Relief Camp"
                value={addressQuery}
                onChange={(e) => setAddressQuery(e.target.value)}
                className="form-input"
                disabled={isSearchingAddress}
              />
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={isSearchingAddress}
              >
                {isSearchingAddress ? 'Searching...' : 'Search & Center Map'}
              </button>
            </div>
          </form>

          {addressSearchFeedback && (
            <div
              className={`alert mt-2 ${
                addressSearchFeedback.type === 'success' ? 'alert-success' : 'alert-danger'
              }`}
              role="alert"
            >
              {addressSearchFeedback.message}
            </div>
          )}

          <div className="manual-divider">
            <span>or enter coordinates directly</span>
          </div>

          {/* Direct Coordinate Form */}
          <form onSubmit={handleManualCoordsSubmit} className="manual-coords-form">
            <div className="coords-inputs-row">
              <div className="coord-field">
                <label htmlFor="manual-lat-input" className="form-label">
                  Latitude (-90 to 90):
                </label>
                <input
                  id="manual-lat-input"
                  type="text"
                  placeholder="e.g. 12.9141"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="coord-field">
                <label htmlFor="manual-lng-input" className="form-label">
                  Longitude (-180 to 180):
                </label>
                <input
                  id="manual-lng-input"
                  type="text"
                  placeholder="e.g. 74.8560"
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

          {coordsError && (
            <p className="form-error-text" role="alert">
              {coordsError}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
