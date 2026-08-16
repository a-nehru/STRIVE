import {
  ExecutionContext,
  Injectable,
  CanActivate,
  HttpStatus,
} from '@nestjs/common';
import { AppError } from 'src/api/errors/app-error.exception';

@Injectable()
export class CookieAuthenticationGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();

    if (request.isAuthenticated()) {
      return true;
    }

    throw new AppError({
      message: 'Invalid session cookie',
      statusCode: HttpStatus.UNAUTHORIZED,
    });
  }
}
