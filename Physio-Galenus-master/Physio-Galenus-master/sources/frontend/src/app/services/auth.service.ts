import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FullUserDto } from '@common-response-dto/full-user.dto';
import { isPlatformBrowser } from '@angular/common';
import { logDebug } from '../utils/log';
import { map } from 'rxjs/operators';
import { authEndpoint } from '@config/endpoints.config';
import { PasswordRecoveryCallDto } from '@common-request-dto/password-recovery-call.dto';
import { ResetPasswordDto } from '@common-request-dto/reset-password.dto';
import { ApplyPasswordRecoveryDto } from '@common-request-dto/apply-password-recovery.dto';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _userSubject: BehaviorSubject<any>;

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: any
  ) {
    let userItem: any = null;
    if (isPlatformBrowser(this.platformId)) {
      userItem = sessionStorage.getItem('user');
    }

    this._userSubject = new BehaviorSubject<FullUserDto>(JSON.parse(userItem));
    this._userSubject.subscribe((user) => {
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }

      if (!user) {
        sessionStorage.removeItem('user');
        return;
      }

      sessionStorage.setItem('user', JSON.stringify(user));

      logDebug('User changed via AuthService', user);
    });
  }

  get userSubject(): BehaviorSubject<FullUserDto> {
    return this._userSubject;
  }

  login(username: string, password: string): Observable<FullUserDto> {
    return this.http
      .post<FullUserDto>(`${authEndpoint.login.$full}`, { username, password })
      .pipe(
        map((userDto: FullUserDto) => {
          if (userDto) {
            this._userSubject.next(userDto);
          }

          return userDto;
        })
      );
  }

  verifyEmail(token: string): Observable<boolean> {
    return this.http.post<boolean>(
      `${authEndpoint.verifyEmail.$full}/${token}`,
      {}
    );
  }

  callPasswordRecovery(email: string): Observable<{ email: string }> {
    return this.http.post<{ email: string }>(
      `${authEndpoint.callPasswordRecovery.$full}/${email}`,
      {}
    );
  }

  verifyPasswordRecoveryRequest(
    token: string
  ): Observable<PasswordRecoveryCallDto> {
    return this.http.get<PasswordRecoveryCallDto>(
      `${authEndpoint.verifyPasswordRecovery.$full}/${token}`
    );
  }

  resetPassword(resetPasswordDto: ResetPasswordDto): Observable<FullUserDto> {
    return this.http.post<FullUserDto>(
      authEndpoint.resetPassword.$full,
      resetPasswordDto
    );
  }

  applyPasswordRecovery(
    token: string,
    data: ApplyPasswordRecoveryDto
  ): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${authEndpoint.applyPasswordRecovery.$full}/${token}`,
      data
    );
  }

  logout(): Observable<boolean> {
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.clear();
    }
    this._userSubject.next(null);
    return this.http.post<boolean>(`${authEndpoint.logout.$full}`, {});
  }

  localLogout(): boolean {
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.clear();
    }
    this._userSubject.next(null);
    return true;
  }
}
