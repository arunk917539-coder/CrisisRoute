import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationCoordinates } from '../types';
import { formatCoordinates } from '../context/LocationContext';

interface MapViewProps {
  selectedCoordinates: LocationCoordinates;
  gpsCoordinates: LocationCoordinates | null;
  isCustomLocationSet: boolean;
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
      <div style="position: absolute; top: -18px; left: 50%; transform: translateX(-50%); background: #1e293b; color: white; font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; white-space: nowrap; pointer-events: none;">
        Request Location
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
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -12],
});

export const MapView: React.FC<MapViewProps> = ({
  selectedCoordinates,
  gpsCoordinates,
  isCustomLocationSet,
  onSelectLocation,
  height = '380px',
  zoomLevel = 13,
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

    // Guard against multiple initializations
    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [selectedCoordinates.lat, selectedCoordinates.lng],
        zoom: isCustomLocationSet ? zoomLevel : 11,
        zoomControl: true,
        attributionControl: true,
      });

      // Free, open OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
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

  // Update Selected Location Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const latLng: [number, number] = [selectedCoordinates.lat, selectedCoordinates.lng];

    if (!selectedMarkerRef.current) {
      const marker = L.marker(latLng, {
        icon: selectedIcon,
        draggable: true,
      }).addTo(map);

      marker.on('dragend', (e) => {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();
        callbackRef.current({ lat: pos.lat, lng: pos.lng });
      });

      selectedMarkerRef.current = marker;
    } else {
      selectedMarkerRef.current.setLatLng(latLng);
    }

    // Bind popup with informative coordinates
    const popupContent = `
      <div style="font-family: inherit; font-size: 13px; line-height: 1.4;">
        <strong style="color: #b91c1c;">Selected Request Location</strong><br/>
        <span>${formatCoordinates(selectedCoordinates.lat, selectedCoordinates.lng)}</span><br/>
        <small style="color: #64748b;">(Drag pin or click map to move)</small>
      </div>
    `;
    selectedMarkerRef.current.bindPopup(popupContent);
  }, [selectedCoordinates]);

  // Update GPS Marker (if different from or alongside selected)
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

        marker.bindPopup(`
          <div style="font-family: inherit; font-size: 13px;">
            <strong style="color: #0369a1;">Your Device GPS Location</strong><br/>
            <span>${formatCoordinates(gpsCoordinates.lat, gpsCoordinates.lng)}</span>
          </div>
        `);

        gpsMarkerRef.current = marker;
      } else {
        gpsMarkerRef.current.setLatLng(gpsLatLng);
      }
    } else if (gpsMarkerRef.current) {
      gpsMarkerRef.current.remove();
      gpsMarkerRef.current = null;
    }
  }, [gpsCoordinates]);

  // Pan to selected coordinates when updated
  const recenterMap = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([selectedCoordinates.lat, selectedCoordinates.lng], 14, {
        animate: true,
      });
    }
  };

  return (
    <div className="map-view-wrapper">
      <div
        ref={mapContainerRef}
        style={{ height, width: '100%', borderRadius: '12px' }}
        className="map-container"
        tabIndex={0}
        aria-label="Interactive map for selecting request location"
      />
      <div className="map-controls-bar">
        <span className="map-hint">
          {isCustomLocationSet ? (
            <>
              <strong>Selected:</strong> {formatCoordinates(selectedCoordinates.lat, selectedCoordinates.lng)} (Click or drag pin to adjust)
            </>
          ) : (
            'Click anywhere on the map or use GPS to set your exact location'
          )}
        </span>
        <button
          type="button"
          onClick={recenterMap}
          className="map-recenter-btn"
          title="Center map on selected location"
        >
          Center on Pin
        </button>
      </div>
    </div>
  );
};
