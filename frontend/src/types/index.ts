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

/**
 * Citizen-facing form draft (includes fields the citizen UI uses but that are NOT
 * sent to the backend, such as latitude/longitude which the backend does not accept).
 */
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

// ---------------------------------------------------------------------------
// PUBLIC CITIZEN API TYPES  — exact backend contract (PublicReportCreate)
// ---------------------------------------------------------------------------

/**
 * Payload sent to POST /public/reports.
 * Only fields accepted by PublicReportCreate (extra=forbid) are included.
 * latitude/longitude are NOT sent — the backend does not accept them.
 */
export interface PublicReportPayload {
  report_type: 'relief' | 'emergency';
  category: string;
  description: string;
  location: string;
  people_affected: number;
  required_quantity: number;
}

/**
 * Citizen-safe status values returned by the backend public_request_status helper.
 */
export type PublicRequestStatus = 'under_review' | 'verified' | 'assigned' | 'in_progress' | 'resolved';

/**
 * Response shape returned by:
 *   POST /public/reports
 *   GET  /public/requests/{request_id}
 *   items[] inside GET /public/requests
 *
 * Mirrors public_request_response() in backend/app/main.py.
 * Internal reconciliation, evidence, audit fields are intentionally absent.
 */
export interface PublicRequestResponse {
  request_id: string;        // e.g. "CR-1" — format: "CR-{report_id}"
  status: PublicRequestStatus;
  category: string;
  description: string;
  location: string;
  people_affected: number;
  required_quantity: number;
  submitted_at: string | null; // ISO 8601
}

/**
 * Response shape returned by GET /public/requests (batch lookup by IDs).
 */
export interface PublicRequestsListResponse {
  count: number;
  items: PublicRequestResponse[];
}

// ---------------------------------------------------------------------------
// API SERVICE TYPES
// ---------------------------------------------------------------------------

export interface ApiSubmissionStatus {
  isAvailable: boolean;
  message: string;
}

export interface SubmitReportResult {
  success: true;
  request: PublicRequestResponse;
}

export interface SubmitReportError {
  success: false;
  errorMessage: string;
}

export type SubmitReportOutcome = SubmitReportResult | SubmitReportError;
