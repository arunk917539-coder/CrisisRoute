import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocationContext } from '../context/LocationContext';
import { MapView } from '../components/MapView';
import { LocationPicker } from '../components/LocationPicker';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    locationData,
    isCustomLocationSet,
    currentGpsCoordinates,
    gpsAccuracy,
    setSelectedCoordinates,
  } = useLocationContext();

  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="container hero-container">
          <div className="hero-content">
            <span className="hero-badge">Direct Citizen Relief Coordination</span>
            <h1 className="hero-title">Need help during an emergency?</h1>
            <p className="hero-subtitle">
              CrisisRoute connects you directly with disaster response coordinators and relief distribution teams.
              Pin your location, describe what you need, and communicate your situation clearly when every minute matters.
            </p>

            <div className="hero-cta-group">
              <button
                type="button"
                className="btn btn-emergency btn-lg"
                onClick={() => navigate('/request-help')}
              >
                <span>🆘 Request Help</span>
              </button>

              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={() => navigate('/track')}
              >
                <span>🔍 Track Request</span>
              </button>
            </div>

            <div className="hero-trust-badges">
              <span className="trust-item">✓ Open-source &amp; Free</span>
              <span className="trust-item">✓ GPS &amp; Manual Coordinates</span>
              <span className="trust-item">✓ Human Review</span>
            </div>
          </div>

          <div className="hero-quick-card">
            <div className="quick-card-inner">
              <h3 className="quick-card-title">Immediate Crisis Steps</h3>
              <ol className="crisis-steps-list">
                <li>
                  <strong>Stay Safe:</strong> Move away from active hazards if safe to do so.
                </li>
                <li>
                  <strong>Set Location:</strong> Use GPS or click the map below to pinpoint where you are.
                </li>
                <li>
                  <strong>State Your Needs:</strong> Submit requirements (medical, food, water, rescue).
                </li>
              </ol>
              <div className="quick-card-footer">
                <small>⚠️ If someone is critically injured or trapped, call 911 / 112 immediately.</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Location & Map Section */}
      <section className="location-section" id="location-picker-section">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">Step 1 of Assistance</span>
            <h2 className="section-title">Pinpoint Your Incident Location</h2>
            <p className="section-description">
              Responders need accurate location coordinates to deliver food, clean water, or rescue aid.
              Allow GPS location detection or click anywhere on the map to set your exact spot.
            </p>
          </div>

          <div className="location-grid">
            <div className="location-controls-col">
              <LocationPicker />

              <div className="location-continue-card">
                <h4>Ready to specify what you need?</h4>
                <p>
                  {isCustomLocationSet
                    ? 'Your location has been selected. Proceed to provide details on people affected and required supplies.'
                    : 'We recommend setting your location above, or you can proceed to enter it on the request form.'}
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={() => navigate('/request-help')}
                >
                  Continue to Request Form &rarr;
                </button>
              </div>
            </div>

            <div className="location-map-col">
              <div className="map-card">
                <div className="map-card-header">
                  <span className="map-card-title">Interactive Crisis Map</span>
                  <span className="map-status-pill">
                    {isCustomLocationSet ? 'Pin Placed' : 'Click to Set Pin'}
                  </span>
                </div>

                <MapView
                  selectedCoordinates={locationData.coordinates}
                  gpsCoordinates={currentGpsCoordinates}
                  isCustomLocationSet={isCustomLocationSet}
                  address={locationData.address}
                  source={locationData.source}
                  gpsAccuracy={gpsAccuracy}
                  onSelectLocation={(coords) => setSelectedCoordinates(coords, 'map_click')}
                  height="440px"
                  zoomLevel={14}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works-section">
        <div className="container">
          <div className="section-header text-center">
            <h2 className="section-title">How CrisisRoute Works for Citizens</h2>
            <p className="section-description">
              A transparent, human-in-the-loop crisis coordination process designed to prevent duplicate reporting and ensure relief reaches real people.
            </p>
          </div>

          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">01</div>
              <h3 className="step-card-title">Pin Your Exact Location</h3>
              <p className="step-card-text">
                Use your device GPS or click on the open map to pinpoint your stranded location or shelter. Coordinates are saved to your request.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">02</div>
              <h3 className="step-card-title">Specify Relief or Emergency</h3>
              <p className="step-card-text">
                Indicate the type of emergency (water, food packets, medical attention, rescue) and the number of people requiring assistance.
              </p>
            </div>

            <div className="step-card">
              <div className="step-number">03</div>
              <h3 className="step-card-title">Verified Coordinator Review</h3>
              <p className="step-card-text">
                Human responders review reports, verify needs, allocate available supplies, and record deliveries in the shared dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
