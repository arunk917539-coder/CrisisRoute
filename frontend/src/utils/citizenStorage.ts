import type { Priority, ReportType } from '../types';

export interface ReportFormDraft {
  reportType: ReportType;
  category: string;
  description: string;
  locationText: string;
  peopleAffected: string;
  requiredQuantity: string;
  priority: Priority;
  evidenceNote: string;
  coordinates: { lat: number; lng: number } | null;
}

export interface SavedDraft { version: 1; savedAt: string; form: ReportFormDraft }
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const DRAFT_STORAGE_KEY = 'crisisroute.report-draft.v1';
const TOKEN_STORAGE_KEY = 'crisisroute.tracking-keys.v1';

function browserStorage(): StorageLike | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage; } catch { return undefined; }
}

export function loadDraft(storage = browserStorage()): SavedDraft | null {
  try {
    const value = JSON.parse(storage?.getItem(DRAFT_STORAGE_KEY) || 'null');
    const form = value?.form;
    if (value?.version !== 1 || !form || !Number.isFinite(Date.parse(value.savedAt))) return null;
    if (!['relief', 'emergency'].includes(form.reportType) || !['low', 'medium', 'high', 'critical'].includes(form.priority)) return null;
    if (!['category', 'description', 'locationText', 'peopleAffected', 'requiredQuantity', 'evidenceNote'].every(key => typeof form[key] === 'string' && form[key].length <= 2000)) return null;
    if (form.coordinates !== null && (!Number.isFinite(form.coordinates?.lat) || Math.abs(form.coordinates.lat) > 90 || !Number.isFinite(form.coordinates?.lng) || Math.abs(form.coordinates.lng) > 180)) return null;
    return value as SavedDraft;
  } catch { return null; }
}

export function saveDraft(form: ReportFormDraft, storage = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), form }));
    return true;
  } catch { return false; }
}

export function clearDraft(storage = browserStorage()): boolean {
  try { if (!storage) return false; storage.removeItem(DRAFT_STORAGE_KEY); return true; } catch { return false; }
}

export function loadTrackingToken(requestId: string, storage = browserStorage()): string {
  try {
    const tokens = JSON.parse(storage?.getItem(TOKEN_STORAGE_KEY) || '{}');
    const value = tokens[requestId.trim().toUpperCase()];
    return typeof value === 'string' ? value : '';
  } catch { return ''; }
}

export function saveTrackingToken(requestId: string, token: string, storage = browserStorage()): boolean {
  try {
    if (!storage || !/^CR-[1-9]\d*$/.test(requestId.trim().toUpperCase())) return false;
    let tokens: Record<string, string> = {};
    try {
      const previous = JSON.parse(storage.getItem(TOKEN_STORAGE_KEY) || '{}');
      if (previous && typeof previous === 'object' && !Array.isArray(previous)) tokens = previous;
    } catch { /* Recover from damaged local storage. */ }
    if (token.trim()) tokens[requestId.trim().toUpperCase()] = token.trim();
    else delete tokens[requestId.trim().toUpperCase()];
    storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
    return true;
  } catch { return false; }
}
