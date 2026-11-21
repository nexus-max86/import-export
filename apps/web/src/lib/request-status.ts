import {
  RECIPIENT_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  type RecipientStatusCode,
  type RequestStatus,
} from '@konzia/shared';

export function requestTone(s: RequestStatus) {
  return s === 'quoted' || s === 'converted'
    ? 'ok'
    : s === 'cancelled' || s === 'expired'
      ? 'neutral'
      : 'warn';
}
export function recipientTone(s: RecipientStatusCode) {
  return s === 'quoted' ? 'ok' : s === 'declined' ? 'bad' : s === 'expired' ? 'neutral' : 'warn';
}
export { RECIPIENT_STATUS_LABELS, REQUEST_STATUS_LABELS };
