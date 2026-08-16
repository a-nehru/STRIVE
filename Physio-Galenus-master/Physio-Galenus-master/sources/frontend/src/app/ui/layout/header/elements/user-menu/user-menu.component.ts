import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@client-services/auth.service';
import { Store } from '@ngrx/store';
import { IState } from 'src/app/state';
import {
  loadNotifications,
  notifyNotifications,
  selectActiveNotifications,
} from 'src/app/state/sections/user-notifications';
import {
  checkPermissions,
  EPermission,
  EPermissionAction,
} from '@common/permissions';

@Component({
  selector: 'app-user-menu',
  templateUrl: './user-menu.component.html',
  styleUrls: ['./user-menu.component.scss'],
})
export class UserMenuComponent implements OnInit {
  notifications$ = this.store.select(selectActiveNotifications);

  constructor(
    private router: Router,
    private authService: AuthService,
    private store: Store<IState>
  ) {}

  ngOnInit(): void {
    const user = this.authService.userSubject.value;
    const canEditNotifications =
      checkPermissions(user, [
        {
          id: EPermission.ManageUserNotifications,
          actions: [EPermissionAction.Edit],
        },
      ]).length === 0;

    if (canEditNotifications) {
      this.store.dispatch(notifyNotifications());
    }

    this.store.dispatch(
      loadNotifications({
        query: {
          data: { is_archived: false, is_removed: false },
          metadata: {
            orderBy: { 'userNotification.audit_dates.created_at': 'DESC' },
          },
        },
      })
    );
  }

  get username(): string {
    return this.authService.userSubject?.value?.username;
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout().toPromise();
    } catch {
      // Do nothing
    } finally {
      await this.router.navigate(['/login']);
    }
  }
}
