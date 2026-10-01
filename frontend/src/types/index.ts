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
export type Priority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Citizen-facing form draft, matching the public submission contract.
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
  priority: Priority;
  evidence_note: string;
}

// ---------------------------------------------------------------------------
// PUBLIC CITIZEN API TYPES  — exact backend contract (PublicReportCreate)
// ---------------------------------------------------------------------------

/**
 * Payload sent to POST /public/reports.
 * Only fields accepted by PublicReportCreate (extra=forbid) are included.
 * Coordinates and optional supporting text are persisted by the backend.
 */
export interface PublicReportPayload {
  report_type: 'relief' | 'emergency';
  category: string;
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  people_affected: number;
  required_quantity: number;
  priority: Priority;
  evidence_note?: string;
}

/**
 * Citizen-safe status values returned by the backend public_request_status helper.
 */
export type PublicRequestStatus = 'under_review' | 'verified' | 'assigned' | 'in_progress' | 'resolved' | 'rejected' | 'unresolved';

export interface PublicCoverage {
  need_id: number;
  verified_quantity: number;
  unit: string;
  allocated_quantity: number;
  outstanding_allocated_quantity: number;
  delivered_quantity: number;
  uncovered_quantity: number;
  coverage_percent: number;
}

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
  report_type: ReportType;
  priority: Priority;
  category: string;
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  people_affected: number;
  required_quantity: number;
  submitted_at: string | null; // ISO 8601
  reviewed_at: string | null;
  updated_at: string | null;
  review_note: string | null;
  coverage: PublicCoverage | null;
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
