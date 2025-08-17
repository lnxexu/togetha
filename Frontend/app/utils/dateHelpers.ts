/**
 * Helper functions for date handling with Philippine timezone
 */

// Philippine timezone identifier
const PHILIPPINES_TIMEZONE = 'Asia/Manila';

/**
 * Convert a date to Philippine timezone (GMT+8) and return a Date object
 * @param date - The date to convert
 * @returns Date object in Philippine timezone
 */
export const convertToPhilippineTime = (date: Date): Date => {
  if (!date) return new Date();

  // Use Intl.DateTimeFormat to get the correct time parts in Asia/Manila
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PHILIPPINES_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);

  // Construct a Date object in local time using the Manila time parts
  return new Date(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
};

/**
 * Convert a date to Philippine timezone and return as ISO string
 * @param date - The date to convert
 * @returns ISO string in Philippine timezone
 */
export const toPhilippineISOString = (date: Date | null | undefined): string | null => {
  if (!date) return null;
  // Format as ISO string with +08:00 offset
  const phDate = convertToPhilippineTime(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    phDate.getFullYear() +
    '-' + pad(phDate.getMonth() + 1) +
    '-' + pad(phDate.getDate()) +
    'T' + pad(phDate.getHours()) +
    ':' + pad(phDate.getMinutes()) +
    ':' + pad(phDate.getSeconds()) +
    '+08:00'
  );
};

/**
 * Get current date and time in Philippine timezone
 * @returns Date object with current Philippine date and time
 */
export const getCurrentPhilippineDate = (): Date => {
  return convertToPhilippineTime(new Date());
};

export const formatLocalDate = (date: Date): string => {
  return date.toLocaleDateString();
};

export const formatLocalTime = (date: Date): string => {
  return date.toLocaleTimeString();
};

export const formatLocalDateTime = (date: Date): string => {
  return date.toLocaleString();
};

export const isToday = (date: Date): boolean => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

export const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear()
  );
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const startOfDay = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
};

export const endOfDay = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
};