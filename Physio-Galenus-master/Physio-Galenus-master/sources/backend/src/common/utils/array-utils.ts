import { maxBy, range as _range } from 'lodash';
import { isDefined } from './is-defined';

export const enum2array = (e: any): string[] =>
  Object.values(e).filter(Number.isNaN) as string[];

export const upsert = (
  arr: any[],
  element: any,
  predicate: (value: any) => boolean,
): void => {
  const index = arr.findIndex(predicate);
  if (index > -1) {
    arr[index] = element;
  } else {
    arr.push(element);
  }
};

/**
 * @see https://stackoverflow.com/a/33034768/368299
 */
export const intersection = (arr1: any[], arr2: any[]): any[] =>
  arr1.filter((x) => arr2.includes(x));

/**
 * @see https://stackoverflow.com/a/33034768/368299
 */
export const difference = (arr1: any[], arr2: any[]): any[] =>
  arr2.filter((x) => !arr1.includes(x));

/**
 * @see https://stackoverflow.com/a/33034768/368299
 */
export const symmetricDifference = (arr1: any[], arr2: any[]): any[] =>
  arr1
    .filter((x) => !arr2.includes(x))
    .concat(arr2.filter((x) => !arr1.includes(x)));

/**
 * @see https://lodash.com/docs/4.17.15#maxBy
 */
export const getObjectWithBiggestValueInArray = <T>(
  array: T[],
  propToSearch: string,
): T | undefined => maxBy(array, propToSearch);

/**
 * @see https://lodash.com/docs/4.17.15#range
 */
export const range = (start: any, stop: any, step = 1) =>
  _range(start, stop, step);

/**
 * Returns a list without null or undefined elements
 * @param array list of objects
 * @returns a list without null or undefined elements
 */
export const getArrayWithoutUndefinedElements = <T>(array: T[]): T[] =>
  array.filter((e) => isDefined(e));

/**
 * Returns whether both arrays have the same elements (ignoring order or duplicate elements)
 * @param arr1 First array to compare
 * @param arr2 Second array to compare
 * @returns Whether both arrays have the same elements (ignoring order or duplicate elements)
 */
export const areArraysEqual = (arr1: any[], arr2: any[]): boolean =>
  arr1.every((el) => arr2.includes(el)) &&
  arr2.every((el) => arr1.includes(el));
