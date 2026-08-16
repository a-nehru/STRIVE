import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { Request, Response } from 'express';
import { InjectEventEmitter } from 'nest-emitter';
import { AppErrorDto } from 'src/common/dto/response/app-error.dto';
import {
  AppError,
  AppErrorType,
  IAppErrorParams,
} from '../api/errors/app-error.exception';

import { ErrorEmitter } from '../events/error.events';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @InjectEventEmitter() private readonly errorEmitter: ErrorEmitter,
  ) {}

  catch(error: Error, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.BAD_REQUEST;
    let type = AppErrorType.Operational;
    if (error instanceof AppError) {
      statusCode = error.status;
      type = error.type;
    } else if (error instanceof HttpException) {
      statusCode = error.getStatus();
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    }

    const message =
      error instanceof HttpException
        ? JSON.stringify(error.getResponse())
        : error.message;
    const additionalData =
      error instanceof AppError ? { ...error.additionalData } : {};
    additionalData.stack = error.stack;

    const basicErrorData: IAppErrorParams = {
      statusCode,
      message,
      additionalData,
    };

    // Emit the error to the AppErrorService and do the actual handling there
    this.errorEmitter.emit('error', new AppError({ ...basicErrorData, type }));

    // Send the error to the client
    /*  if (isProduction()) { TO DO: IMPLEMENT ISPRODUCTION()
      delete basicErrorData.additionalData.stack;
    }*/
    const errorDto = plainToClass(AppErrorDto, {
      ...basicErrorData,
      timestamp: new Date().toISOString(),
      path: request.url,
    });

    if (statusCode === HttpStatus.GONE) {
      response.setHeader('Cache-Control', ['no-store', 'max-age=0']);
    }
    response.status(statusCode).json(errorDto);
  }
}
