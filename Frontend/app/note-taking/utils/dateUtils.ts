// Parse server-provided datetime strings reliably as local Date objects
// If the string has no timezone (no 'Z' and no +/- offset), assume it's UTC and append 'Z'
export function parseServerDate(input?: string | null): Date | undefined {
  if (!input || typeof input !== 'string') return undefined;
  const hasTZ = /[zZ]|[\+\-]\d{2}:?\d{2}$/.test(input);
  const normalized = hasTZ ? input : `${input}Z`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? undefined : d;
}

export function formatShortDate(d?: Date): string {
  if (!d) return '';
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}