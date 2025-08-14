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