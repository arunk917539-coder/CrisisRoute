import { PublicReportPayload, SubmitReportOutcome, PublicRequestResponse, PublicQuestion, PublicTimelineEvent, PublicPhoto } from '../types';

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
export async function getPublicRequest(requestId: string, signal?: AbortSignal, token = ''): Promise<{ success: boolean; request?: PublicRequestResponse; errorMessage?: string; needsKey?: boolean }> {
  try {
    const response = await apiFetch(`/public/requests/${encodeURIComponent(requestId)}`, { signal, headers: trackingHeaders(token) });

    if (!response.ok) {
      let errorMessage = `Retrieval failed (${response.status})`;
      if (response.status === 404) {
        errorMessage = 'Request ID not found. Please check and try again.';
      } else if (response.status === 400) {
        errorMessage = 'Enter a valid request ID, such as CR-1.';
      } else if (response.status === 401 || response.status === 403) {
        errorMessage = 'Enter the private access key saved when this request was created.';
      }
      return { success: false, errorMessage, needsKey: response.status === 401 || response.status === 403 };
    }

    const data: PublicRequestResponse = await response.json();
    return { success: true, request: data };
  } catch (err) {
    return { success: false, errorMessage: networkMessage(err) };
  }
}

function trackingHeaders(token: string): Record<string, string> {
  return token ? { 'X-Tracking-Token': token } : {};
}

export type ApiResult<T> = { success: true; data: T } | { success: false; errorMessage: string };

async function publicRequestAction<T>(requestId: string, suffix: string, token: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const response = await apiFetch(`/public/requests/${encodeURIComponent(requestId)}${suffix}`, {
      ...options, headers: { ...trackingHeaders(token), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (!response.ok) {
      let message = `Request failed (${response.status}). Please try again.`;
      try { const error = await response.json(); if (typeof error.detail === 'string') message = error.detail; } catch { /* Keep HTTP fallback. */ }
      return { success: false, errorMessage: message };
    }
    return { success: true, data: await response.json() as T };
  } catch (error) {
    return { success: false, errorMessage: options.method && options.method !== 'GET'
      ? 'The server did not confirm this change. Check the latest questions or photos before retrying; it may have been saved.'
      : networkMessage(error) };
  }
}

async function publicList<T>(requestId: string, suffix: string, token: string, signal?: AbortSignal): Promise<ApiResult<T[]>> {
  const result = await publicRequestAction<T[] | { items: T[] }>(requestId, suffix, token, { signal });
  return result.success ? { success: true, data: Array.isArray(result.data) ? result.data : result.data.items } : result;
}

export const getPublicQuestions = (requestId: string, token: string, signal?: AbortSignal) => publicList<PublicQuestion>(requestId, '/questions', token, signal);
export const getPublicTimeline = (requestId: string, token: string, signal?: AbortSignal) => publicList<PublicTimelineEvent>(requestId, '/timeline', token, signal);
export const getPublicPhotos = (requestId: string, token: string, signal?: AbortSignal) => publicList<PublicPhoto>(requestId, '/photos', token, signal);
export const replyToQuestion = (requestId: string, token: string, questionId: number, answer: string) => publicRequestAction<PublicQuestion>(requestId, '/replies', token, { method: 'POST', body: JSON.stringify({ question_id: questionId, answer }) });

export function validatePhotos(files: Pick<File, 'name' | 'size' | 'type'>[], existingCount = 0): string | null {
  if (files.length + existingCount > 3) return 'A request can have up to 3 photos.';
  for (const file of files) {
    if (!['image/jpeg', 'image/png'].includes(file.type)) return `${file.name}: choose a JPEG or PNG image.`;
    if (file.size <= 0 || file.size > 3 * 1024 * 1024) return `${file.name}: each photo must be between 1 byte and 3 MB.`;
  }
  return null;
}

export async function uploadPublicPhoto(requestId: string, token: string, file: File): Promise<ApiResult<PublicPhoto>> {
  const validationError = validatePhotos([file]);
  if (validationError) return { success: false, errorMessage: validationError };
  try {
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The photo could not be read. Reselect it and try again.'));
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return await publicRequestAction<PublicPhoto>(requestId, '/photos', token, { method: 'POST', body: JSON.stringify({ filename: file.name, data_base64: dataBase64 }) });
  } catch (error) { return { success: false, errorMessage: error instanceof Error ? error.message : 'Photo could not be read.' }; }
}

export async function getPublicPhotoContent(requestId: string, token: string, photoId: number, signal?: AbortSignal): Promise<ApiResult<Blob>> {
  try {
    const response = await apiFetch(`/public/requests/${encodeURIComponent(requestId)}/photos/${photoId}/content`, { headers: trackingHeaders(token), signal });
    if (!response.ok) return { success: false, errorMessage: `Unable to load photo (${response.status}).` };
    return { success: true, data: await response.blob() };
  } catch (error) { return { success: false, errorMessage: networkMessage(error) }; }
}
