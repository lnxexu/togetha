/**
 * Utilities for handling UTC timestamps from the backend and rendering
 * them in the device's local timezone consistently.
 */

/**
 * Parse an ISO 8601 datetime string (UTC or with offset) to a Date object.
 * The Date object is always in the device's local timezone when rendered.
 */
export function parseISOToDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  // Native Date parsing handles ISO 8601 with Z/offset correctly.
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format an ISO string in the device's local date and time.
 */
export function formatISOToLocal(iso: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  const d = parseISOToDate(iso);
  if (!d) return '';
  return d.toLocaleString(undefined, options);
}

/**
 * Return a short friendly date-time like "Oct 5, 2025, 3:14 PM" in local time.
 */
export function formatFriendlyLocal(iso: string | null | undefined): string {
  const d = parseISOToDate(iso);
  if (!d) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Convert a local Date to an ISO string in UTC (with trailing Z),
 * suitable for sending to the backend that stores in UTC.
 */
export function toUTCISOString(date: Date | null | undefined): string | null {
  if (!date) return null;
  return new Date(date.getTime()).toISOString();
}
