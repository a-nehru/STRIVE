import { HttpStatus } from '@nestjs/common';

export enum AppErrorTag {
  Client = 'client', // For errors coming from the frontend
}

export enum AppErrorType {
  Operational = 'operational', // For controlled errors
  Exception = 'exception', // For exceptional errors
}

export interface IAppErrorParams {
  readonly message: string;
  readonly additionalData?: any;
  readonly tag?: AppErrorTag;
  readonly type?: AppErrorType;
  readonly statusCode?: HttpStatus;
}

/**
 * A common exception class for all errors related to business domain.
 * If AppErrorType.Exception, it will crash the application thus restarting it.
 */
export class AppError extends Error {
  public readonly tag: AppErrorTag;
  public readonly type: AppErrorType;
  public readonly additionalData: any;
  public readonly status: HttpStatus;

  constructor({
    message,
    additionalData,
    tag,
    type = AppErrorType.Operational,
    statusCode = HttpStatus.BAD_REQUEST,
  }: IAppErrorParams) {
    super(message);

    Object.setPrototypeOf(this, new.target.prototype);

    this.message = message;
    this.tag = tag;
    this.type = type;
    this.additionalData = additionalData;
    this.status = statusCode;

    Error.captureStackTrace(this);
  }
}
