import { isDefined } from '@common-utils/is-defined';
import { concatStrings } from '@common-utils/string-utils';
import faker = require('faker');

export const pseudoFirstName = (): string => {
  return faker.name.firstName();
};

export const pseudoLastName = (): string => {
  return faker.name.lastName();
};

export const pseudoEmail = (): string => {
  return faker.internet.email();
};

export const pseudoBirthDate = (
  minimunAge: number,
  maximumAge: number,
): Date => {
  const from = new Date();
  from.setFullYear(from.getFullYear() - maximumAge);

  const to = new Date();
  to.setFullYear(to.getFullYear() - minimunAge);

  return faker.date.between(from, to);
};

export const nullOrRandomPhone = (phone: string, prefix: string): string => {
  if (!isDefined(phone)) {
    return null;
  }
  const baseNumber = Math.floor(
    Math.random() * (999888777 - 111222333 + 1) + 111222333,
  );
  return concatStrings('', prefix, baseNumber + '');
};

export const nullOrRandomString = (base: string, length: number): string => {
  if (!isDefined(base)) {
    return null;
  }

  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

export const nullOrLoremIpsumWords = (
  base: string,
  numberOfWords: number,
): string => {
  if (!isDefined(base)) {
    return null;
  }

  return faker.lorem.words(numberOfWords);
};

export const nullOrPartial = (
  text: string,
  prefix: number,
  padding: string,
  suffix: number,
): string => {
  if (!isDefined(text)) {
    return null;
  }

  return concatStrings(
    '',
    isDefined(prefix) ? prefix + '' : null,
    padding,
    isDefined(suffix) ? suffix + '' : null,
  );
};
