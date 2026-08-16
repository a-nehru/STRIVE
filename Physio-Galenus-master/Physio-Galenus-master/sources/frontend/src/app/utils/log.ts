import { isProduction } from './environment-utils';

export const logError = (message?: any, ...optionalParams: any[]): void =>
  console.error(message, ...optionalParams);

export const logInfo = (message?: any, ...optionalParams: any[]): void =>
  console.log(message, ...optionalParams);

export const logDebug = (message?: any, ...optionalParams: any[]): void => {
  if (!isProduction()) {
    console.log(message, ...optionalParams);
  }
};
