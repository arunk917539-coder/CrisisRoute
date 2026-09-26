import { CitizenReportDraft, ApiSubmissionStatus, PublicReportPayload, SubmitReportOutcome, PublicRequestResponse } from '../types';

const baseUrl = import.meta.env.VITE_API_BASE_URL;

if (!baseUrl) {
  throw new Error("VITE_API_BASE_URL is not defined in the environment. Please configure it in your .env file.");
}

export const API_BASE_URL = baseUrl;

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
 * Submit a public citizen request to POST /public/reports.
 */
export async function createPublicReport(
  payload: PublicReportPayload
): Promise<SubmitReportOutcome> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMessage = `Submission failed (${response.status})`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.detail) {
          errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
        }
      } catch (e) {
        // ignore JSON parse error
      }
      return { success: false, errorMessage };
    }

    const data: PublicRequestResponse = await response.json();
    return { success: true, request: data };
  } catch (err) {
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : 'Network error occurred while submitting.',
    };
  }
}

/**
 * Retrieve a public citizen request from GET /public/requests/{request_id}.
 */
export async function getPublicRequest(requestId: string): Promise<{ success: boolean; request?: PublicRequestResponse; errorMessage?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/requests/${encodeURIComponent(requestId)}`);

    if (!response.ok) {
      let errorMessage = `Retrieval failed (${response.status})`;
      if (response.status === 404) {
        errorMessage = 'Request ID not found. Please check and try again.';
      }
      return { success: false, errorMessage };
    }

    const data: PublicRequestResponse = await response.json();
    return { success: true, request: data };
  } catch (err) {
    return { success: false, errorMessage: 'Network error occurred while retrieving request.' };
  }
}
