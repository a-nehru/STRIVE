import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Logger } from 'winston';
import { safeStringify } from '../common/utils/variable-utils';
import { envConfig } from '@config/environment.config';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const controller = context.getClass().name;

    const user = req.user ? req.user.username || req.user.nickname : 'N/A';

    const clonedBody: {
      password: string; // user attribute
      passwordCheck: string; // user attribute
      token: string; // patient attribute
    } = JSON.parse(JSON.stringify(req.body));

    delete clonedBody.password;
    delete clonedBody.passwordCheck;
    delete clonedBody.token;

    const controllerIsBlackListed =
      envConfig.logger.blackListedControllers.includes(controller);
    if (!controllerIsBlackListed) {
      const currentMemoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
      // BEFORE request
      this.logger.info(
        `Requesting ${req.method} ${
          req.originalUrl
        } by ${user}. Current memory usage: ${Math.round(
          (currentMemoryUsage * 100) / 100,
        )} MB.`,
        {
          tag: controller,
          additionalData: {
            ip: req.headers['x-forwarded-for'],
            body: clonedBody,
          },
        },
      );
    }

    // AFTER request
    let nextRequest = next.handle();
    if (!controllerIsBlackListed) {
      const now = Date.now();
      const currentMemoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
      nextRequest = nextRequest.pipe(
        tap((data) => {
          const dataAsJson = safeStringify(data);
          this.logger.info(
            `Requested ${req.method} ${req.originalUrl} by ${user} took ${
              Date.now() - now
            }ms to complete. Current memory usage: ${Math.round(
              (currentMemoryUsage * 100) / 100,
            )} MB.`,
            {
              tag: controller,
              additionalData: {
                body: dataAsJson
                  ? dataAsJson.substring(0, envConfig.logger.maxStringLength)
                  : null,
              },
            },
          );
        }),
      );
    }

    return nextRequest;
  }
}
