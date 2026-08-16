import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import {
  isDevelopment,
  isProduction,
  isTesting,
} from '@common-utils/environment-utils';
import * as entities from '../database/entity';
import * as migrations from '../database/migration';
import * as subscribers from '../database/subscriber';
import { envConfig } from './environment.config';

let databaseConfig: TypeOrmModuleOptions;

if (isProduction()) {
  databaseConfig = {
    type: 'postgres',
    host: envConfig.database.host,
    port: envConfig.database.port,
    username: envConfig.database.username,
    password: envConfig.database.password,
    database: envConfig.database.name,
    synchronize: envConfig.database.sync || false,
    dropSchema: false,
    migrationsRun: false,
    logging: ['migration', 'schema', 'error'],
    entities: Object.values(entities),
    subscribers: Object.values(subscribers),
    migrations: [...Object.values(migrations)] as any,
  };
} else if (isDevelopment()) {
  databaseConfig = {
    type: 'postgres',
    host: envConfig.database.host,
    port: envConfig.database.port,
    username: envConfig.database.username,
    password: envConfig.database.password,
    database: envConfig.database.name,
    synchronize: envConfig.database.sync || false,
    dropSchema: false,
    migrationsRun: false,
    logging: ['migration', 'schema', 'error'],
    entities: Object.values(entities),
    subscribers: Object.values(subscribers),
    migrations: [...Object.values(migrations)] as any,
    cli: {
      entitiesDir: 'src/database/entity',
      migrationsDir: 'src/database/migration',
    },
  };
} else if (isTesting()) {
  databaseConfig = {
    type: 'postgres',
    host: 'localhost',
    port: 5555,
    username: 'postgres',
    password: 'postgres',
    database: 'postgres',
    synchronize: envConfig.database.sync || false,
    dropSchema: false,
    migrationsRun: false,
    logging: ['migration'],
    entities: Object.values(entities),
    subscribers: Object.values(subscribers),
    migrations: [...Object.values(migrations)] as any,
  };
}

export = databaseConfig;
