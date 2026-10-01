import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { LocationCoordinates, LocationData, GeolocationStatus } from '../types';
import { useGeolocation } from '../hooks/useGeolocation';

// Sensible default location (fallback center when GPS or custom location is not yet acquired)
export const DEFAULT_COORDINATES: LocationCoordinates = {
  lat: 20.5937,
  lng: 78.9629,
};

export function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

interface SearchAddressResult {
  success: boolean;
  coordinates?: LocationCoordinates;
  displayName?: string;
  error?: string;
}

interface LocationContextType {
  locationData: LocationData;
  isCustomLocationSet: boolean;
  gpsStatus: GeolocationStatus;
  gpsErrorMessage: string | null;
  gpsAccuracy: number | null;
  currentGpsCoordinates: LocationCoordinates | null;
  requestCurrentLocation: () => Promise<void>;
  setSelectedCoordinates: (
    coords: LocationCoordinates,
    source?: 'gps' | 'map_click' | 'manual' | 'address_search',
    customAddress?: string
  ) => void;
  searchAddress: (query: string) => Promise<SearchAddressResult>;
  setManualAddressText: (address: string) => void;
  clearLocation: () => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { status, coordinates: gpsCoords, accuracy, errorMessage, requestLocation } = useGeolocation();

  const [locationData, setLocationData] = useState<LocationData>({
    coordinates: DEFAULT_COORDINATES,
    address: '',
    accuracy: null,
    source: 'default',
    updatedAt: Date.now(),
  });

  const [isCustomLocationSet, setIsCustomLocationSet] = useState<boolean>(false);

  // Background reverse geocode without blocking UI
  const attemptReverseGeocode = useCallback(async (lat: number, lng: number): Promise<string | null> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
        {
          headers: { 'Accept-Language': 'en' },
          signal: controller.signal,
        }
      );
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.display_name) {
          return data.display_name;
        }
      }
    } catch {
      // Graceful fallback: return null so caller knows no reverse address was obtained
    }
    return null;
  }, []);

  const setSelectedCoordinates = useCallback(
    async (
      coords: LocationCoordinates,
      source: 'gps' | 'map_click' | 'manual' | 'address_search' = 'map_click',
      customAddress?: string
    ) => {
      // If a custom address (e.g. from address search or user input) is provided, use it.
      // Otherwise, use 'Selected map location' as the label until reverse-geocoding finishes.
      const initialAddress = customAddress || 'Selected map location';

      setLocationData({
        coordinates: coords,
        address: initialAddress,
        accuracy: source === 'gps' ? accuracy : null,
        source,
        updatedAt: Date.now(),
      });
      setIsCustomLocationSet(true);

      // If no custom manual address was provided, attempt reverse geocoding via OpenStreetMap
      if (!customAddress) {
        const readable = await attemptReverseGeocode(coords.lat, coords.lng);
        if (readable) {
          setLocationData((prev) => {
            // Only update if coordinates haven't changed in the meantime
            if (prev.coordinates.lat === coords.lat && prev.coordinates.lng === coords.lng) {
              return { ...prev, address: readable };
            }
            return prev;
          });
        }
      }
    },
    [accuracy, attemptReverseGeocode]
  );

  // Intentional address search using OpenStreetMap Nominatim
  const searchAddress = useCallback(
    async (query: string): Promise<SearchAddressResult> => {
      const trimmed = query.trim();
      if (!trimmed) {
        return { success: false, error: 'Please enter a location or address to search.' };
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&limit=1&addressdetails=1`,
          {
            headers: { 'Accept-Language': 'en' },
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (!res.ok) {
          return {
            success: false,
            error: 'Location search is currently unavailable. Please click directly on the map to set your location.',
          };
        }

        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
          return {
            success: false,
            error: `No location found for "${trimmed}". Try entering a broader city/area name or click directly on the map.`,
          };
        }

        const match = data[0];
        const lat = parseFloat(match.lat);
        const lng = parseFloat(match.lon);

        if (isNaN(lat) || isNaN(lng)) {
          return { success: false, error: 'Invalid coordinates returned for this location. Please click on the map.' };
        }

        const coords = { lat, lng };
        const displayName = match.display_name || trimmed;

        // Atomically update location context with resolved coordinates and address
        await setSelectedCoordinates(coords, 'address_search', displayName);

        return {
          success: true,
          coordinates: coords,
          displayName,
        };
      } catch {
        return {
          success: false,
          error: 'Location search timed out or was interrupted. You can select your location manually on the map.',
        };
      }
    },
    [setSelectedCoordinates]
  );

  const requestCurrentLocation = useCallback(async () => {
    const coords = await requestLocation();
    if (coords) {
      await setSelectedCoordinates(coords, 'gps');
    }
  }, [requestLocation, setSelectedCoordinates]);

  const setManualAddressText = useCallback((address: string) => {
    setLocationData((prev) => ({
      ...prev,
      address,
      source: 'manual',
      updatedAt: Date.now(),
    }));
    setIsCustomLocationSet(true);
  }, []);

  const clearLocation = useCallback(() => {
    setLocationData({
      coordinates: DEFAULT_COORDINATES,
      address: '',
      accuracy: null,
      source: 'default',
      updatedAt: Date.now(),
    });
    setIsCustomLocationSet(false);
  }, []);

  return (
    <LocationContext.Provider
      value={{
        locationData,
        isCustomLocationSet,
        gpsStatus: status,
        gpsErrorMessage: errorMessage,
        gpsAccuracy: accuracy,
        currentGpsCoordinates: gpsCoords,
        requestCurrentLocation,
        setSelectedCoordinates,
        searchAddress,
        setManualAddressText,
        clearLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export function useLocationContext(): LocationContextType {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocationContext must be used within a LocationProvider');
  }
  return context;
}
