import { envConfig } from '@config/environment.config';

/**
 * Production environment used in PRODUCTION and STAGING environment. Can be used only if server-side.
 */
export const isProduction = (): boolean =>
  envConfig.environment === 'production';

/**
 * Development environment used in localhost. Can be used only if server-side.
 */
export const isDevelopment = (): boolean =>
  !envConfig.environment || envConfig.environment === 'development';

/**
 * Testing environment used when running tests. Can be used only if server-side.
 */
export const isTesting = (): boolean => envConfig.environment === 'testing';
