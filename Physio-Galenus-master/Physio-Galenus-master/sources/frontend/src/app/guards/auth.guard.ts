import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
} from '@angular/router';
import { checkPermissions, IPermission } from '@common/permissions';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private router: Router, private authService: AuthService) {}

  async canActivate(
    next: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<boolean> {
    const user = this.authService.userSubject.value;
    if (!user) {
      // Not logged in so redirect to login page with the return url
      await this.router.navigate(['/login'], {
        queryParams: { returnUrl: state.url },
      });
      return false;
    }

    if (!next.data || !next.data.permissions) {
      return true;
    }

    const requiredPermissions: IPermission[] = next.data.permissions;

    // Check if there is any permission at all. If not, just ignore the guard
    if (requiredPermissions && requiredPermissions.length === 0) {
      return true;
    }

    // Check if the user has any lacking permission
    const lackingPermissions = checkPermissions(user, requiredPermissions);

    // Grant access only if there are not any missing permissions
    return lackingPermissions.length === 0;
  }
}
