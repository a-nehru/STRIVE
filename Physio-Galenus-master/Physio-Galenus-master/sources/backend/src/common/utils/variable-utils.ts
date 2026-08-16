import { isDefined } from 'class-validator';
import { get } from 'lodash';
import { stringsConfig } from '@config/strings.config';

/**
 * Retrieves the passed value if not undefined or defaultValue otherwise. If the
 * defaultValue is also undefined, it will finally return null
 * @param value the expected value to return
 * @param defaultValue the value to return in case the other one is undefined or null if also undefined
 */
export const getValueOrDefault = <T, E>(
  value: T,
  defaultValue: E,
): T | E | null =>
  value === undefined
    ? defaultValue === undefined
      ? null
      : defaultValue
    : value;

export const getShowUserNullValue = (): string => {
  return 'Unavailable';
};

export const valueOrUnavailable = (
  value: unknown,
  trueFalseValues?: { trueValue: unknown; falseValue: unknown },
): unknown | string => {
  const result = isDefined(value) ? value : stringsConfig.unavailableData;
  if (trueFalseValues && typeof result === 'boolean') {
    return result ? trueFalseValues.trueValue : trueFalseValues.falseValue;
  }

  return result;
};

export const inRange = (x: number, min: number, max: number) =>
  x >= min && x <= max;

export const getPropOrDefault = (
  object: any,
  path: [] | string,
  defaultValue?: any,
): any => get(object, path, defaultValue);

const replacer = () => {
  const seen = new WeakSet();
  return (key: any, value: any) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};

export const safeStringify = (object: any) =>
  JSON.stringify(object, replacer());
