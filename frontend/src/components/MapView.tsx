import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationCoordinates } from '../types';
import { formatCoordinates } from '../context/LocationContext';

interface MapViewProps {
  selectedCoordinates: LocationCoordinates;
  gpsCoordinates: LocationCoordinates | null;
  isCustomLocationSet: boolean;
  address?: string;
  source?: string;
  gpsAccuracy?: number | null;
  onSelectLocation: (coords: LocationCoordinates) => void;
  height?: string;
  zoomLevel?: number;
}

// Custom crisp SVG pins to avoid Leaflet default asset bundling issues in Vite
const selectedIcon = L.divIcon({
  className: 'leaflet-custom-marker',
  html: `
    <div style="position: relative; width: 36px; height: 44px; transform: translate(-50%, -100%);">
      <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.35));">
        <path d="M18 0C8.05888 0 0 8.05888 0 18C0 29.5 15.2 42.5 17.2 44.1C17.7 44.5 18.3 44.5 18.8 44.1C20.8 42.5 36 29.5 36 18C36 8.05888 27.9411 0 18 0Z" fill="#DC2626"/>
        <circle cx="18" cy="18" r="7" fill="#FFFFFF"/>
        <circle cx="18" cy="18" r="3.5" fill="#DC2626"/>
      </svg>
      <div style="position: absolute; top: -18px; left: 50%; transform: translateX(-50%); background: #991b1b; color: white; font-size: 11px; font-weight: 700; padding: 2px 6px; border-radius: 4px; white-space: nowrap; pointer-events: none; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">
        Selected Location
      </div>
    </div>
  `,
  iconSize: [36, 44],
  iconAnchor: [18, 44],
  popupAnchor: [0, -44],
});

const gpsIcon = L.divIcon({
  className: 'leaflet-gps-marker',
  html: `
    <div style="position: relative; width: 24px; height: 24px; transform: translate(-50%, -50%);">
      <div style="position: absolute; inset: -8px; border-radius: 50%; background: rgba(2, 132, 199, 0.25); animation: pulse 2s infinite ease-out;"></div>
      <div style="width: 20px; height: 20px; border-radius: 50%; background: #0284c7; border: 3px solid #ffffff; box-shadow: 0 1px 4px rgba(0,0,0,0.3);"></div>
      <div style="position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); background: #0369a1; color: white; font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; white-space: nowrap; pointer-events: none;">
        Your Location
      </div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

function getSourceLabel(source?: string): string {
  switch (source) {
    case 'gps':
      return 'GPS Verified';
    case 'map_click':
      return 'Manual Map Selection';
    case 'address_search':
      return 'Address Search';
    case 'manual':
      return 'Manually Entered Coordinates';
    default:
      return 'Default Area';
  }
}

export const MapView: React.FC<MapViewProps> = ({
  selectedCoordinates,
  gpsCoordinates,
  isCustomLocationSet,
  address,
  source,
  gpsAccuracy,
  onSelectLocation,
  height = '380px',
  zoomLevel = 14,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const selectedMarkerRef = useRef<L.Marker | null>(null);
  const gpsMarkerRef = useRef<L.Marker | null>(null);
  const callbackRef = useRef(onSelectLocation);

  // Keep callback fresh in ref
  useEffect(() => {
    callbackRef.current = onSelectLocation;
  }, [onSelectLocation]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialZoom = isCustomLocationSet ? zoomLevel : 11;
      const map = L.map(mapContainerRef.current, {
        center: [selectedCoordinates.lat, selectedCoordinates.lng],
        zoom: initialZoom,
        zoomControl: true,
        attributionControl: true,
      });

      // Free, open OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Handle map clicks to set/move location
      map.on('click', (e: L.LeafletMouseEvent) => {
        const clickedCoords: LocationCoordinates = {
          lat: e.latlng.lat,
          lng: e.latlng.lng,
        };
        callbackRef.current(clickedCoords);
      });

      mapInstanceRef.current = map;

      // Invalidate size once container mounts properly
      setTimeout(() => {
        map.invalidateSize();
      }, 150);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
    // Run only on mount and unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Selected Location Marker & Center Map Deterministically
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // If no custom location is set yet, ensure no misleading pin is displayed
    if (!isCustomLocationSet) {
      if (selectedMarkerRef.current) {
        selectedMarkerRef.current.remove();
        selectedMarkerRef.current = null;
      }
      return;
    }

    const latLng: [number, number] = [selectedCoordinates.lat, selectedCoordinates.lng];

    if (!selectedMarkerRef.current) {
      const marker = L.marker(latLng, {
        icon: selectedIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', (e) => {
        const m = e.target as L.Marker;
        const pos = m.getLatLng();
        callbackRef.current({ lat: pos.lat, lng: pos.lng });
      });

      selectedMarkerRef.current = marker;
    } else {
      selectedMarkerRef.current.setLatLng(latLng);
    }

    // Always center the map when selected coordinates change
    const currentCenter = map.getCenter();
    const distanceMeters = map.distance(currentCenter, latLng);
    if (distanceMeters > 2) {
      const targetZoom = Math.max(map.getZoom(), zoomLevel);
      map.setView(latLng, targetZoom, { animate: true });
    }

    // Bind popup with informative coordinates and address
    const displayAddress = address && address.trim().length > 0 ? address : 'Selected map location';
    const popupContent = `
      <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 180px;">
        <strong style="color: #b91c1c; font-size: 14px;">Selected Location</strong><br/>
        <div style="margin: 4px 0; color: #1e293b;">${displayAddress}</div>
        <div style="font-family: monospace; font-size: 12px; color: #475569;">
          Lat: ${selectedCoordinates.lat.toFixed(5)}<br/>
          Lng: ${selectedCoordinates.lng.toFixed(5)}
        </div>
        <small style="color: #64748b; display: block; margin-top: 4px;">(Click map or drag pin to adjust)</small>
      </div>
    `;
    selectedMarkerRef.current.bindPopup(popupContent);
  }, [selectedCoordinates, isCustomLocationSet, address, zoomLevel]);

  // Update GPS Marker (Device position)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (gpsCoordinates) {
      const gpsLatLng: [number, number] = [gpsCoordinates.lat, gpsCoordinates.lng];

      if (!gpsMarkerRef.current) {
        const marker = L.marker(gpsLatLng, {
          icon: gpsIcon,
          interactive: true,
        }).addTo(map);

        gpsMarkerRef.current = marker;
      } else {
        gpsMarkerRef.current.setLatLng(gpsLatLng);
      }

      gpsMarkerRef.current.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4;">
          <strong style="color: #0369a1; font-size: 14px;">Your Current Location</strong><br/>
          <span style="color: #334155;">Device GPS position</span><br/>
          <div style="font-family: monospace; font-size: 12px; color: #475569; margin-top: 3px;">
            Lat: ${gpsCoordinates.lat.toFixed(5)}<br/>
            Lng: ${gpsCoordinates.lng.toFixed(5)}
          </div>
          ${
            gpsAccuracy
              ? `<span style="font-size: 11px; color: #64748b;">Accuracy: &plusmn;${Math.round(gpsAccuracy)}m</span>`
              : ''
          }
        </div>
      `);
    } else if (gpsMarkerRef.current) {
      gpsMarkerRef.current.remove();
      gpsMarkerRef.current = null;
    }
  }, [gpsCoordinates, gpsAccuracy]);

  // Center on selected pin
  const handleCenterOnSelection = () => {
    if (mapInstanceRef.current && isCustomLocationSet) {
      mapInstanceRef.current.setView([selectedCoordinates.lat, selectedCoordinates.lng], zoomLevel, {
        animate: true,
      });
    }
  };

  // Center on GPS device location
  const handleCenterOnGps = () => {
    if (mapInstanceRef.current && gpsCoordinates) {
      mapInstanceRef.current.setView([gpsCoordinates.lat, gpsCoordinates.lng], zoomLevel, {
        animate: true,
      });
    }
  };

  const hasReadableAddress = Boolean(
    address && address.trim().length > 0 && address !== 'Selected map location'
  );

  return (
    <div className="map-view-wrapper">
      {/* Map Canvas */}
      <div
        ref={mapContainerRef}
        style={{ height, width: '100%', borderRadius: '12px 12px 0 0' }}
        className="map-container"
        tabIndex={0}
        aria-label="Interactive map for selecting request location"
      />

      {/* Map Interactive Toolbar */}
      <div className="map-controls-bar">
        <div className="map-legend">
          <span className="legend-item">
            <span className="legend-bullet bullet-red" />
            <span className="legend-label">Selected Help Pin</span>
          </span>
          {gpsCoordinates && (
            <span className="legend-item">
              <span className="legend-bullet bullet-blue" />
              <span className="legend-label">Your Device GPS</span>
            </span>
          )}
        </div>

        <div className="map-btn-group">
          {isCustomLocationSet && (
            <button
              type="button"
              onClick={handleCenterOnSelection}
              className="map-recenter-btn"
              title="Center map on selected location"
            >
              Center on Pin
            </button>
          )}
          {gpsCoordinates && (
            <button
              type="button"
              onClick={handleCenterOnGps}
              className="map-recenter-btn btn-gps-center"
              title="Center map on your device GPS location"
            >
              Center on GPS
            </button>
          )}
        </div>
      </div>

      {/* Prominent Location Summary Box Near the Map */}
      <div className="map-location-summary" aria-live="polite">
        {isCustomLocationSet ? (
          <div className="summary-card-inner">
            <div className="summary-top-row">
              <div className="summary-title-group">
                <span className="summary-indicator-dot red-dot" />
                <h4 className="summary-title">Selected Help Location</h4>
              </div>
              <span className="summary-source-tag">{getSourceLabel(source)}</span>
            </div>

            <div className="summary-address-row">
              <span className="summary-label">Location / Address:</span>
              <p className="summary-address-text">
                {hasReadableAddress ? address : 'Selected map location'}
              </p>
            </div>

            <div className="summary-coords-row">
              <div className="coord-chip">
                <span className="coord-chip-label">Latitude:</span>
                <code className="coord-chip-val">{selectedCoordinates.lat.toFixed(5)}</code>
              </div>
              <div className="coord-chip">
                <span className="coord-chip-label">Longitude:</span>
                <code className="coord-chip-val">{selectedCoordinates.lng.toFixed(5)}</code>
              </div>
              <div className="coord-chip">
                <span className="coord-chip-label">Formatted:</span>
                <code className="coord-chip-val">
                  {formatCoordinates(selectedCoordinates.lat, selectedCoordinates.lng)}
                </code>
              </div>
            </div>

            {gpsCoordinates && (
              <div className="summary-gps-notice">
                <span className="summary-indicator-dot blue-dot" />
                <span>
                  <strong>Your Device GPS:</strong> {gpsCoordinates.lat.toFixed(5)},{' '}
                  {gpsCoordinates.lng.toFixed(5)}
                  {gpsAccuracy ? ` (±${Math.round(gpsAccuracy)}m)` : ''}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="summary-unselected-box">
            <div className="unselected-icon-col">
              <span className="unselected-pin-icon">📍</span>
            </div>
            <div className="unselected-text-col">
              <strong className="unselected-title">No location selected yet</strong>
              <p className="unselected-desc">
                Click anywhere on the map, use <em>&ldquo;Use My Current Location&rdquo;</em>, or enter an
                address to place your request pin.
              </p>
              <small className="unselected-hint">
                Map currently displaying fallback view ({formatCoordinates(selectedCoordinates.lat, selectedCoordinates.lng)})
              </small>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
