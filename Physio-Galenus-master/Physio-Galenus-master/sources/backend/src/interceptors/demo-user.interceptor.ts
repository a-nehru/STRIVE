import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { AppError } from '../api/errors/app-error.exception';
import { DEMO_USER_ALLOWED_KEY } from '../decorators/demo-user-allowed.decorator';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

@Injectable()
export class DemoUserInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();

    if (SAFE_METHODS.includes(req.method)) {
      return next.handle();
    }

    if (!req.user) {
      return next.handle();
    }

    if (!req.user.is_demo) {
      return next.handle();
    }

    const isDemoUserAllowed = this.reflector.getAllAndOverride<boolean>(
      DEMO_USER_ALLOWED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isDemoUserAllowed) {
      return next.handle();
    }

    throw new AppError({
      message: 'Demo users cannot modify data',
      statusCode: HttpStatus.FORBIDDEN,
    });
  }
}
