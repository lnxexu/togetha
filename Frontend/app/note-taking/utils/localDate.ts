// Utilities for device-local date handling

// If server datetime string lacks timezone, assume UTC by appending 'Z'
export function parseServerDate(input?: string | null): Date | undefined {
  if (!input || typeof input !== 'string') return undefined;
  const hasTZ = /[zZ]|[\+\-]\d{2}:?\d{2}$/.test(input);
  const normalized = hasTZ ? input : `${input}Z`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? undefined : d;
}

export function formatShortLocalDate(d?: Date): string {
  if (!d) return '';
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}