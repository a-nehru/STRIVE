import { environment } from 'src/environments/environment';

/**
 * Production environment used in PRODUCTION environment.
 */
export const isProduction = (): boolean => environment.production;

/**
 * Development environment used in localhost.
 */
export const isDevelopment = (): boolean => !environment.production;
