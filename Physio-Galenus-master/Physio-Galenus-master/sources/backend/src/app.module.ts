import { Module, Scope } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as databaseConfig from './config/database.config';
import { UsersModule } from './api/users/users.module';
import { PatientsModule } from './api/patients/patients.module';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { CustomValidationPipe } from './pipes/custom-validation.pipe';
import { WhitelistModule } from './api/whitelist/whitelist.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { EVENT_EMITTER_TOKEN, NestEmitterModule } from 'nest-emitter';
import { EventEmitter } from 'events';
import { AppErrorModule } from './api/errors/app-error.module';
import { WinstonModule } from 'nest-winston';
import { loggingConfig } from './config/logging.config';
import { AuthModule } from './api/auth/auth.module';
import { RoutinesModule } from './api/routines/routines.module';
import { ExercisesModule } from './api/exercises/exercises.module';
import { ACLModule } from './api/acl/acl.module';
import { StatisticsModule } from './api/statistics/statistics.module';
import { InstanceHealthModule } from './api/instance-health/instance-health.module';
import { ChangelogModule } from './api/changelog/changelog.module';
import { UserNotificationsModule } from './api/user-notifications/user-notifications.module';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { DemoUserInterceptor } from './interceptors/demo-user.interceptor';
import { ApiKeysModule } from './api/api-keys/api-keys.module';
import { PricingPlansModule } from './api/pricing-plans/pricing-plans.module';

@Module({
  imports: [
    WinstonModule.forRoot(loggingConfig),
    TypeOrmModule.forRoot(databaseConfig),
    NestEmitterModule.forRoot(new EventEmitter()),
    UsersModule,
    PatientsModule,
    RoutinesModule,
    ExercisesModule,
    WhitelistModule,
    AppErrorModule,
    AuthModule,
    ACLModule,
    StatisticsModule,
    InstanceHealthModule,
    ChangelogModule,
    UserNotificationsModule,
    ApiKeysModule,
    PricingPlansModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: DemoUserInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
      inject: [EVENT_EMITTER_TOKEN],
    },
    {
      provide: APP_PIPE,
      useClass: CustomValidationPipe,
      scope: Scope.REQUEST,
    },
  ],
})
export class AppModule {}
