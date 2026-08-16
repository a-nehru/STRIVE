import { isProduction } from '@common-utils/environment-utils';
import { blue, gray, green, yellow } from 'colors/safe';
import { WinstonModuleOptions } from 'nest-winston';
import { format } from 'logform/dist/browser';
import { transports } from 'winston';
import { envConfig } from './environment.config';

export const loggingConfig: WinstonModuleOptions = {
  level: envConfig.logger.level || 'debug',
  silent: false,
  exitOnError: false,
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.label({
      label: 'Winston',
    }),
    isProduction()
      ? format.json()
      : format.printf(
          ({
            context,
            label,
            timestamp,
            level,
            message,
            tag,
            additionalData,
            ...others
          }) => {
            return `${green(`[${label}]`)} ${timestamp} | ${yellow(
              level.toUpperCase(),
            )} | ${context ? `${yellow(context)} | ` : ''}${
              tag ? blue(tag) + ' | ' : ''
            }${message} ${
              additionalData ? gray(JSON.stringify(additionalData)) : ''
            } ${others ? gray(JSON.stringify(others)) : ''}`;
          },
        ),
  ),
  transports: [new transports.Console()],
};
