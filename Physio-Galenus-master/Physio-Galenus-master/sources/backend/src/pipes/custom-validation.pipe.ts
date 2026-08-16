import {
  Inject,
  Injectable,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Request } from 'express';
import { AppError } from '../api/errors/app-error.exception';

@Injectable()
export class CustomValidationPipe extends ValidationPipe {
  constructor(@Inject(REQUEST) req: Request) {
    super({ transform: true });

    this.exceptionFactory = (errors: ValidationError[]) => {
      const validationErrors = {
        errors: {},
        exception: undefined,
      };

      try {
        validationErrors.errors = this.buildError(errors);
      } catch (error) {
        validationErrors.exception = {
          message: error,
          rawErrors: errors.map((e) => e.children.map((ec) => ec.value)),
        };
      }

      throw new AppError({
        message: 'Validation failed',
        additionalData: { path: req.path, validationErrors },
      });
    };
  }

  private buildError(errors: ValidationError[]): any {
    const result = {};
    errors.forEach((el) => {
      const prop = el.property;
      if (el.constraints) {
        Object.entries(el.constraints).forEach((constraint) => {
          result[`${prop}#${constraint[0]}`] = constraint[1];
        });
      } else if (el.children && el.children.length > 0) {
        el.children.forEach((cel) => {
          Object.entries(cel.constraints).forEach((constraint) => {
            result[`${prop}#${constraint[0]}`] = constraint[1];
          });
        });
      }
    });
    return result;
  }
}
