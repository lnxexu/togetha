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

/**
 * Convert a local Date to an ISO 8601 string that includes the local timezone offset
 * (e.g., 2025-10-06T02:00:00+08:00). This preserves the user's intended local date/time
 * when parsed by servers that respect ISO offsets.
 */
export function toLocalOffsetISOString(date: Date | null | undefined): string | null {
  if (!date) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const tz = -date.getTimezoneOffset(); // minutes east of UTC
  const sign = tz >= 0 ? '+' : '-';
  const tzAbs = Math.abs(tz);
  const tzH = pad(Math.floor(tzAbs / 60));
  const tzM = pad(tzAbs % 60);
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${tzH}:${tzM}`;
}
