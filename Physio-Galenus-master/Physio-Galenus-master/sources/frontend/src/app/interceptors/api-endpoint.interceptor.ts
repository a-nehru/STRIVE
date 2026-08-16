import {
  HTTP_INTERCEPTORS,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { prefixEndpoint } from '@config/endpoints.config';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable()
export class ApiEndpointInterceptor implements HttpInterceptor {
  intercept(
    request: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    request = request.clone({
      url: `${environment.backend.baseUrl}/${prefixEndpoint}/${request.url}`,
      withCredentials: true,
    });

    return next.handle(request);
  }
}

export const apiEndpointInterceptorProvider = {
  provide: HTTP_INTERCEPTORS,
  useClass: ApiEndpointInterceptor,
  multi: true,
};
