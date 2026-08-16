import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { InjectEventEmitter } from 'nest-emitter';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import * as process from 'process';
import { Logger } from 'winston';
import { ErrorEmitter } from '../../events/error.events';
import { AppError, AppErrorType } from './app-error.exception';

@Injectable()
export class AppErrorService implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    @InjectEventEmitter() private readonly errorEmitter: ErrorEmitter,
  ) {}

  onModuleInit(): void {
    this.errorEmitter.on('error', (appError: AppError) =>
      this.onError(appError),
    );
  }

  private onError(appError: AppError): void {
    this.handleError(appError);

    if (appError.type === AppErrorType.Exception) {
      process.exit(1);
    }
  }

  /**
   * Actual method managing the error
   */
  private handleError(appError: AppError): void {
    this.logger.error(appError);
  }

  onApplicationShutdown(signal: string): void {
    this.logger.warn(`Shutting down the application. Signal (${signal}).`);
  }
}
