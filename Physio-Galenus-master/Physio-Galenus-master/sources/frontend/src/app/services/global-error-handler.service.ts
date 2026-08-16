import {
  ErrorHandler,
  Inject,
  Injectable,
  Injector,
  NgZone,
  PLATFORM_ID,
  Type,
} from '@angular/core';
import {
  isPlatformBrowser,
  LocationStrategy,
  PathLocationStrategy,
} from '@angular/common';
import { fromError } from 'stacktrace-js';
import { HttpClient } from '@angular/common/http';
import { plainToClass } from 'class-transformer';
import { LogAppErrorDto } from '@common/dto/request/log-app-error.dto';
import { ToastrService } from 'ngx-toastr';

@Injectable()
export class GlobalErrorHandler extends ErrorHandler {
  isBrowser: boolean;

  constructor(
    private readonly http: HttpClient,
    private readonly injector: Injector,
    private readonly ngZone: NgZone,
    @Inject(PLATFORM_ID) platformId: any
  ) {
    super();
    this.isBrowser = isPlatformBrowser(platformId);
  }

  // Need to get ToastrService from injector rather than constructor injection to avoid cyclic dependency error
  private get toastrService(): ToastrService {
    return this.injector.get(ToastrService);
  }

  handleError(error: any): void {
    const location = this.injector.get<LocationStrategy>(
      LocationStrategy as unknown as Type<LocationStrategy>
    );
    const message = error.message ? error.message : error.toString();
    const url = location instanceof PathLocationStrategy ? location.path() : '';

    // Get the stack trace, lets grab the last 10 stacks only
    let stackString = '';
    fromError(error)
      .then((stackframes) => {
        stackString = stackframes
          .splice(0, 20)
          .map((sf) => {
            return sf.toString();
          })
          .join('\n');
      })
      .finally(() => {
        // Log on the server
        const logAppErrorDto = plainToClass(LogAppErrorDto, {
          message,
          additionalData: {
            route: url,
            stack: stackString,
          },
        });

        this.http.post<LogAppErrorDto>('errors', logAppErrorDto).subscribe({
          // tslint:disable-next-line:no-console
          next: () => console.log('Error logged onto the server.'),
          error: (err) =>
            console.error('Error could not be logged onto the server', err),
        });
      });

    // Inform the user about it
    if (this.isBrowser) {
      // Toast
      let errorMessage = error.error ? error.error.message : error.message;
      const wrongRequestMessage =
        error.rejection &&
        error.rejection.error &&
        error.rejection.error.statusCode === 400 &&
        error.rejection.error.message;
      if (wrongRequestMessage) {
        errorMessage = wrongRequestMessage;
      }

      this.toastrService.error(`Error: ${errorMessage}`, 'Error', {
        closeButton: true,
        disableTimeOut: true,
        onActivateTick: true,
      });
    }

    super.handleError(error);

    // Throw it to prevent infinity error loops
    throw error;
  }
}
