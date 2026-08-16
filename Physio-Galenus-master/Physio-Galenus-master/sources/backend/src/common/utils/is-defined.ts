/**
 * Checks if value is defined (!== undefined, !== null)
 * @param value the element to check if it is defined
 * @returns true if the value is different from null or undefined. Otherwise, false
 */
export const isDefined = <T>(value: T | undefined | null): value is T =>
  (value as T) !== undefined && (value as T) !== null;
