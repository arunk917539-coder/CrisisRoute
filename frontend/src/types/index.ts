export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface LocationData {
  coordinates: LocationCoordinates;
  address: string;
  accuracy?: number | null;
  source: 'gps' | 'map_click' | 'manual' | 'address_search' | 'default';
  updatedAt: number;
}

export type GeolocationStatus = 'idle' | 'loading' | 'success' | 'denied' | 'error';

export type ReportType = 'relief' | 'emergency';

export interface CitizenReportDraft {
  report_type: ReportType;
  category: string;
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  people_affected: number;
  required_quantity: number;
  evidence_status: 'none' | 'photo' | 'document' | 'other';
  evidence_source: string;
  evidence_note: string;
}

export interface ApiSubmissionStatus {
  isAvailable: boolean;
  message: string;
}
