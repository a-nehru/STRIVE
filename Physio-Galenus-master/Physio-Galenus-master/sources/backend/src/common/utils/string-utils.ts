/**
 * Returns the client's public ID padding with enough 0s
 * @param publicId the public ID of the client
 */
export const formatClientPublicId = (publicId: number): string =>
  `${publicId}`.padStart(7, '0');

/**
 * Concatenates a list of given strings safely, i.e., ignoring undefined or null values.
 * @param delimiter the string used as a separator between the given strings
 * @param strings the list of strings to concatenate
 */
export const concatStrings = (
  delimiter: string,
  ...strings: string[]
): string => {
  return strings.filter(Boolean).join(delimiter);
};

/**
 * Converts the first letter of the string to upper case
 * @param str the string to capitalize the first character
 * @returns a string whose first character is capitalized
 */
export const capitalize = (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1);
