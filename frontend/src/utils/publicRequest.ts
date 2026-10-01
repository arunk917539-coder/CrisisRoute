import type { PublicRequestStatus } from '../types';

export function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) return 'Not yet available';
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp);
  const parsed = new Date(hasTimezone ? timestamp : `${timestamp}Z`);
  return Number.isNaN(parsed.getTime()) ? 'Not yet available' : parsed.toLocaleString();
}

export function statusLabel(status: PublicRequestStatus): string {
  const labels: Record<PublicRequestStatus, string> = {
    under_review: 'Under Review',
    verified: 'Verified',
    assigned: 'Supplies Allocated',
    in_progress: 'Partially Delivered',
    resolved: 'Resolved',
    rejected: 'Rejected',
    unresolved: 'Needs More Information',
  };
  return labels[status] || status;
}

export function statusDescription(status: PublicRequestStatus): string {
  const descriptions: Record<PublicRequestStatus, string> = {
    under_review: 'Your request has been saved and is waiting for human review.',
    verified: 'A responder has verified your request. Verification does not confirm dispatch or arrival.',
    assigned: 'Supplies have been allocated to this need. Delivery has not yet been confirmed.',
    in_progress: 'A responder has recorded a partial delivery. Some verified need remains unmet.',
    resolved: 'The response team has recorded completion of the verified need.',
    rejected: 'A responder has rejected this report. Read the review note below for the reason.',
    unresolved: 'A responder needs more information before this report can be verified. Read the review note below.',
  };
  return descriptions[status] || 'Status is currently being updated.';
}

export function escapeHtml(value: string): string {
  const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, (character) => escapes[character]);
}
