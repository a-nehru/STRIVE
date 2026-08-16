import { format, isValid, parseISO } from 'date-fns';

/**
 * Checks whether a Date object is valid
 * @param date the date to check
 * @returns true if valid; false otherwise
 */
export const isValidDate = (date: Date): boolean =>
  isValid(date) && date.getFullYear() <= 9999;

/**
 * Converts the date to the ISO format using the local time
 * @param date The date object to convert
 * @returns A string in ISO format
 */
export const dateToLocalISOString = (date: Date): string =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString();

/**
 * Returns the given date in the specific application format
 * @param isoStringDate e.g. `'1991-04-02'`, `'1991-04-02T00:00:00.000Z'`, etc.
 * @returns a string representing the formatted date
 */
export const isoDateToApplicationString = (
  isoStringDate: string,
): string | null => {
  const d = dateFromIso(isoStringDate);
  if (!d) {
    return null;
  }

  return format(d, 'dd/MM/yyyy');
};

/**
 * Creates a Date object from a compliant ISO 8601 string.
 * @param isoStringDate e.g. `'1991-04-02'`, `'1991-04-02T00:00:00.000Z'`, etc.
 * @returns a valid Date object or null otherwise
 */
export const dateFromIso = (isoStringDate: string): Date | null => {
  const d = parseISO(isoStringDate);
  if (!isValidDate(d)) {
    return null;
  }

  return d;
};

/**
 * Extracts the date part only (no time) from a Date object and format it to the expected JS format
 * @param date the date to parse
 * @returns a valid string date formatted as 'yyyy-MM-dd' or null otherwise
 */
export const isoFromDate = (date: Date): string | null => {
  if (!isValidDate(date)) {
    return null;
  }

  return format(date, 'yyyy-MM-dd');
};

/**
 * Convenient method to directly convert ISO Date object to 12 time format.
 * @param date the date to parse
 * @returns a valid string date formatted as 'hh:mm'
 */
export const isoDateToTime = (date: Date): string | null => {
  if (!isValidDate(date)) {
    return null;
  }

  const time = format(date, 'hh:mm');
  return time;
};
