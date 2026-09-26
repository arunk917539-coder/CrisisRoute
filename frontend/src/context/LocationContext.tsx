import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { LocationCoordinates, LocationData, GeolocationStatus } from '../types';
import { useGeolocation } from '../hooks/useGeolocation';

// Sensible default location (fallback center when GPS is not yet acquired)
// Default to a central coordinates point with neutral context
export const DEFAULT_COORDINATES: LocationCoordinates = {
  lat: 20.5937,
  lng: 78.9629,
};

export function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
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
    source?: 'gps' | 'map_click' | 'manual',
    customAddress?: string
  ) => void;
  setManualAddressText: (address: string) => void;
  clearLocation: () => void;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { status, coordinates: gpsCoords, accuracy, errorMessage, requestLocation } = useGeolocation();

  const [locationData, setLocationData] = useState<LocationData>({
    coordinates: DEFAULT_COORDINATES,
    address: 'Default map center (Please pin your location)',
    accuracy: null,
    source: 'default',
    updatedAt: Date.now(),
  });

  const [isCustomLocationSet, setIsCustomLocationSet] = useState<boolean>(false);

  // Background reverse geocode without blocking UI
  const attemptReverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
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
          // Truncate or use nice readable address
          return data.display_name;
        }
      }
    } catch {
      // Graceful fallback to formatted coordinates if offline or rate limited
    }
    return formatCoordinates(lat, lng);
  }, []);

  const setSelectedCoordinates = useCallback(
    async (
      coords: LocationCoordinates,
      source: 'gps' | 'map_click' | 'manual' = 'map_click',
      customAddress?: string
    ) => {
      const fallbackAddress = customAddress || formatCoordinates(coords.lat, coords.lng);
      setLocationData({
        coordinates: coords,
        address: fallbackAddress,
        accuracy: source === 'gps' ? accuracy : null,
        source,
        updatedAt: Date.now(),
      });
      setIsCustomLocationSet(true);

      // If no custom manual address was provided, try fetching the street/city name
      if (!customAddress) {
        const readable = await attemptReverseGeocode(coords.lat, coords.lng);
        setLocationData((prev) => {
          // Only update if coordinates haven't changed in the meantime
          if (prev.coordinates.lat === coords.lat && prev.coordinates.lng === coords.lng) {
            return { ...prev, address: readable };
          }
          return prev;
        });
      }
    },
    [accuracy, attemptReverseGeocode]
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
      address: 'Default map center (Please pin your location)',
      accuracy: null,
      source: 'default',
      updatedAt: Date.now(),
    });
    setIsCustomLocationSet(false);
  }, []);

  // Update when GPS coordinates successfully arrive
  useEffect(() => {
    if (gpsCoords && status === 'success') {
      setSelectedCoordinates(gpsCoords, 'gps');
    }
  }, [gpsCoords, status, setSelectedCoordinates]);

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
