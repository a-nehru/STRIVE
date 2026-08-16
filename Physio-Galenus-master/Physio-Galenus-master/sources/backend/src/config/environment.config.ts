import * as process from 'process';

/**
 * This file contains the configuration related to the application environment.
 * That is, the environment properties necessary to run the application.
 */
export const envConfig = Object.freeze({
  port: process.env.PORT || 3000,
  patientTokenLength: 12,
  maxPatientTokenRetries: 15,
  host: Object.freeze({
    url: process.env.URL,
  }),
  environment: process.env.NODE_ENV,
  database: Object.freeze({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    name: process.env.DATABASE_DBNAME,
    sync: String(process.env.DATABASE_SYNC) === 'true',
  }),
  logger: Object.freeze({
    level: process.env.LOGGER_LEVEL,
    blackListedControllers: [],
    maxStringLength: 2500,
  }),
  cookieManagement: Object.freeze({
    secret: process.env.COOKIE_SECRET,
  }),
  aws: Object.freeze({
    region: process.env.AWS_REGION,
    emailSender: Object.freeze({
      config: Object.freeze({
        apiVersion: '2010-12-01',
        accessKeyId: process.env.AWS_EMAIL_SENDER_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_EMAIL_SENDER_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
      }),
      originationAddress: process.env.AWS_EMAIL_ORIGINATION_ADDRESS,
    }),
  }),
  apiKey: Object.freeze({
    staticApiKey: process.env.STATIC_API_KEY,
  }),
  seed: Object.freeze({
    demoPassword: process.env.DEMO_PASSWORD,
    demoAccessToken: process.env.DEMO_ACCESS_TOKEN,
  }),
});

const REQUIRED_ENV_VARS = [
  'COOKIE_SECRET',
  'DATABASE_HOST',
  'DATABASE_PORT',
  'DATABASE_USERNAME',
  'DATABASE_PASSWORD',
  'DATABASE_DBNAME',
];

export function validateRequiredEnvVars(): void {
  const missing = REQUIRED_ENV_VARS.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }
}
