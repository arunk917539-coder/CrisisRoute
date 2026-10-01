import { PublicReportPayload, SubmitReportOutcome, PublicRequestResponse } from '../types';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL?.trim() || '/api').replace(/\/+$/, '');

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...options, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

function networkMessage(err: unknown, submitting = false): string {
  if (err instanceof Error && err.name === 'AbortError') {
    return submitting
      ? 'The server did not respond in time. The request may have arrived; ask the demo coordinator to check before submitting again.'
      : 'The server did not respond in time. Status will retry automatically.';
  }
  return 'Unable to reach the server. Check your connection and the shared backend, then try again.';
}

/**
 * Health check helper to verify backend availability.
 * Never throws unhandled network exceptions; returns a clean status object.
 */
export async function checkBackendHealth(): Promise<{ isOnline: boolean; demoData?: string; error?: string }> {
  try {
    const response = await apiFetch('/health');

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
    const response = await apiFetch('/public/reports', {
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
      errorMessage: networkMessage(err, true),
    };
  }
}

/**
 * Retrieve a public citizen request from GET /public/requests/{request_id}.
 */
export async function getPublicRequest(requestId: string, signal?: AbortSignal): Promise<{ success: boolean; request?: PublicRequestResponse; errorMessage?: string }> {
  try {
    const response = await apiFetch(`/public/requests/${encodeURIComponent(requestId)}`, { signal });

    if (!response.ok) {
      let errorMessage = `Retrieval failed (${response.status})`;
      if (response.status === 404) {
        errorMessage = 'Request ID not found. Please check and try again.';
      } else if (response.status === 400) {
        errorMessage = 'Enter a valid request ID, such as CR-1.';
      }
      return { success: false, errorMessage };
    }

    const data: PublicRequestResponse = await response.json();
    return { success: true, request: data };
  } catch (err) {
    return { success: false, errorMessage: networkMessage(err) };
  }
}
