import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { Connection } from 'typeorm';
import { AppModule } from './app.module';
import * as helmet from 'helmet';
import { WinstonModule } from 'nest-winston';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as session from 'express-session';
import * as passport from 'passport';
import { TypeormStore } from 'connect-typeorm/out';
import { Session } from './database/entity/session.entity';
import { SessionOptions } from 'express-session';
import { isProduction } from './common/utils/environment-utils';
import { envConfig, validateRequiredEnvVars } from '@config/environment.config';
import { docsEndpoint, prefixEndpoint } from '@config/endpoints.config';
import { loggingConfig } from '@config/logging.config';
import { corsConfig } from '@config/cors.config';

const bootstrap = async (): Promise<void> => {
  validateRequiredEnvVars();
  // Set application timezone to UTC; could be set in environment, but set here to
  // force always this timezone
  process.env.TZ = 'UTC';

  const logger = WinstonModule.createLogger(loggingConfig);
  logger.log(
    `🎈 Launching application in ${envConfig.environment.toUpperCase()} environment...`,
  );

  // Application creation
  const app: NestExpressApplication =
    await NestFactory.create<NestExpressApplication>(AppModule, {
      // This is only done so as to a Winston logger is used during bootstrap
      logger,
    });

  if (!isProduction()) {
    app.setGlobalPrefix(prefixEndpoint);
  }

  // Setup Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('Physio Galenus')
    .setDescription('The backend API of Physio Galenus')
    .setVersion('0.1')
    .build();
  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(
    isProduction()
      ? docsEndpoint.$full
      : `${prefixEndpoint}/${docsEndpoint.$full}`,
    app,
    document,
  );

  app.enableCors(corsConfig);
  app.enable('trust proxy');
  app.enableShutdownHooks();

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ limit: '50mb', extended: true }));
  app.use(helmet());

  const connection = app.get(Connection);

  const sessionRepository = connection.getRepository(Session);

  // Database synchronization / migrations
  const shouldSync = envConfig.database.sync;
  if (shouldSync) {
    logger.log(`🔎 Synchronizing database...`);
    await connection.dropDatabase();
    await connection.synchronize();
  }
  logger.log(`🔎 Migrations found: ${connection.migrations.length}`);
  logger.log(`🔎 Migrations run: ${(await connection.runMigrations()).length}`);
  logger.log(`🔎 Subscribers found: ${connection.subscribers.length}`);

  const sessionConfig = {
    secret: envConfig.cookieManagement?.secret,
    resave: false,
    saveUninitialized: false,
    store: new TypeormStore({
      cleanupLimit: 2,
      ttl: 86400,
    }).connect(sessionRepository),
  } as SessionOptions;

  if (isProduction()) {
    sessionConfig.cookie = {
      sameSite: 'none',
    };
    sessionConfig.cookie.secure = true;
  }
  app.use(session(sessionConfig));

  app.use(passport.initialize());
  app.use(passport.session());

  //app.useGlobalGuards(new AppVersionGuard());

  //setEndpointsRateLimits(app);

  // Application listening
  const listeningPort = envConfig.port;
  await app.listen(listeningPort);

  logger.log(`🚀 Application listening at port ${listeningPort}`);
};
bootstrap();
