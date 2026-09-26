import { useState, useCallback } from 'react';
import { GeolocationStatus, LocationCoordinates } from '../types';

interface GeolocationResult {
  status: GeolocationStatus;
  coordinates: LocationCoordinates | null;
  accuracy: number | null;
  errorMessage: string | null;
  requestLocation: () => Promise<LocationCoordinates | null>;
}

export function useGeolocation(): GeolocationResult {
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [coordinates, setCoordinates] = useState<LocationCoordinates | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestLocation = useCallback(async (): Promise<LocationCoordinates | null> => {
    if (!navigator.geolocation) {
      setStatus('denied');
      setErrorMessage('Location access is not supported by this browser. You can select your location manually on the map.');
      return null;
    }

    setStatus('loading');
    setErrorMessage(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords: LocationCoordinates = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setCoordinates(coords);
          setAccuracy(position.coords.accuracy);
          setStatus('success');
          setErrorMessage(null);
          resolve(coords);
        },
        (error) => {
          let msg = 'Location access was not available. You can select your location manually on the map.';
          if (error.code === error.PERMISSION_DENIED) {
            setStatus('denied');
            msg = 'Location access was not available. You can select your location manually on the map.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            setStatus('error');
            msg = 'Unable to determine your current location. Please select your position on the map.';
          } else if (error.code === error.TIMEOUT) {
            setStatus('error');
            msg = 'Location request timed out. Please try again or select your location manually on the map.';
          } else {
            setStatus('error');
          }
          setErrorMessage(msg);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        }
      );
    });
  }, []);

  return {
    status,
    coordinates,
    accuracy,
    errorMessage,
    requestLocation,
  };
}
