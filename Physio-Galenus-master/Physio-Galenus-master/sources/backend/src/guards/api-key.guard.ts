import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpStatus,
} from '@nestjs/common';
import { AppError } from 'src/api/errors/app-error.exception';
import { isDefined } from 'src/common/utils/is-defined';
import { envConfig } from '@config/environment.config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    if (
      isDefined(request?.query?.apiKey) &&
      request.query.apiKey.toUpperCase() ===
        envConfig.apiKey.staticApiKey?.toUpperCase()
    ) {
      return true;
    }

    throw new AppError({
      message: 'Invalid API key',
      statusCode: HttpStatus.UNAUTHORIZED,
    });
  }
}
