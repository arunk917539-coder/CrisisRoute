import { CitizenReportDraft, ApiSubmissionStatus } from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Health check helper to verify backend availability.
 * Never throws unhandled network exceptions; returns a clean status object.
 */
export async function checkBackendHealth(): Promise<{ isOnline: boolean; demoData?: string; error?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(`${API_BASE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      return { isOnline: true, demoData: data.demo_data };
    }
    return { isOnline: false, error: `Server returned ${response.status}` };
  } catch (err) {
    return {
      isOnline: false,
      error: err instanceof Error ? err.message : 'Backend unreachable',
    };
  }
}

/**
 * Citizen Report Submission Handler.
 *
 * Current backend status:
 * The backend currently provides responder-internal endpoints (`POST /reports` for synthetic intake),
 * but does not yet provide an authenticated or rate-limited public citizen intake contract.
 *
 * To honor strict safety rules:
 * - We do NOT send unvetted citizen reports to admin-only /reports endpoints.
 * - We do NOT fake a successful submission.
 * - We clearly inform the citizen that the submission endpoint will be wired in Batch 2.
 */
export async function submitCitizenReport(
  _report: CitizenReportDraft
): Promise<{ success: boolean; message: string; trackingCode?: string }> {
  // Staging integration point for citizen submission.
  // In Batch 2, when the public citizen endpoint is exposed (e.g. POST /api/citizen/reports),
  // this function will execute the verified fetch call.
  return {
    success: false,
    message:
      'Citizen public submission pipeline is currently in staging. Your report draft has been prepared locally but was not dispatched to avoid submitting to internal responder queues.',
  };
}

/**
 * Status indicator for citizen services.
 */
export function getCitizenApiStatus(): ApiSubmissionStatus {
  return {
    isAvailable: false,
    message: 'Citizen intake API is in staging (Batch 2). Draft preview is enabled.',
  };
}
