/**
 * Color-coded status pill.
 *
 * Maps the backend status values to a CSS class:
 *   valid -> green, invalid -> red, accept_all/catch_all -> amber,
 *   disposable -> purple, unknown (and anything else) -> gray.
 */

// Human-friendly labels for known statuses.
const LABELS = {
  valid: 'Valid',
  invalid: 'Invalid',
  accept_all: 'Accept-all',
  catch_all: 'Catch-all',
  disposable: 'Disposable',
  unknown: 'Unknown',
};

export function statusClass(status) {
  switch (status) {
    case 'valid':
    case 'invalid':
    case 'accept_all':
    case 'catch_all':
    case 'disposable':
      return status;
    default:
      return 'unknown';
  }
}

export default function StatusBadge({ status }) {
  const cls = statusClass(status);
  const label = LABELS[status] || status || 'Unknown';
  return <span className={`badge ${cls}`}>{label}</span>;
}
