import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  MatSnackBar,
  MatSnackBarRef,
  TextOnlySnackBar,
} from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import { FilterUserNotificationsDto } from '@common-request-dto/filter-user-notifications.dto';
import {
  IPaginationData,
  IPaginationOptions,
} from '@common/interfaces/pagination.interface';
import { paginationConfig } from '@config/pagination.config';
import { Store } from '@ngrx/store';
import { setFilterNotifications } from 'src/app/state/search/filter-user-notifications';
import {
  bulkUpdateNotifications,
  loadNotifications,
  saveNotificationAction,
  selectNotifications,
  undoBulkNotificationAction,
  undoNotificationAction,
  updateNotification,
} from 'src/app/state/sections/user-notifications';
import {
  TArchivedUserNotification,
  TBulkUpdateUserNotification,
  TReadUserNotification,
} from '../elements/table-notifications/table-notifications.component';
import { IState } from 'src/app/state';
import { showLoading } from 'src/app/state/search/shared-params';
import { selectIsLoading } from 'src/app/state/search/shared-params/shared-params.selector';

type TState = {
  heading: string;
  subheading: string;
  headingIcon: string;
};

@Component({
  selector: 'app-user-notifications',
  templateUrl: './user-notifications.component.html',
  styleUrls: ['./user-notifications.component.scss'],
})
export class UserNotificationsComponent implements OnInit, OnDestroy {
  state: TState = {
    heading: 'My Notifications',
    subheading: 'List of available notifications',
    headingIcon: 'notifications',
  };

  paginationData: IPaginationData = {
    pageSize: paginationConfig.defaultPageSize,
    page: 1,
  };
  paginationOptions: IPaginationOptions = {
    pageSizeOptions: paginationConfig.defaultPageSizeOptions,
  };

  isLoading$ = this.store.select(selectIsLoading);
  notifications$ = this.store.select(selectNotifications);

  private snackBarRef: MatSnackBarRef<TextOnlySnackBar>;

  constructor(private store: Store<IState>, private snackBar: MatSnackBar) {
    this.notifications$.subscribe(
      (notificationListDto) =>
        notificationListDto.data &&
        (this.paginationData = {
          ...this.paginationData,
          ...notificationListDto.metadata,
        })
    );
  }

  ngOnInit(): void {
    this.onRefresh();
  }

  onRefresh(): void {
    const query = {
      data: {
        is_archived: false,
        is_removed: false,
      },
      metadata: {
        ...this.paginationData,
        orderBy: { 'userNotification.audit_dates.created_at': 'DESC' },
      },
    } as FilterUserNotificationsDto;

    this.store.dispatch(setFilterNotifications({ query }));

    this.store.dispatch(showLoading());
    this.store.dispatch(loadNotifications({ query }));
  }

  onRemove(id: string): void {
    const is_removed = true;

    this.store.dispatch(updateNotification({ id, is_removed }));
    this.store.dispatch(
      saveNotificationAction({
        action: { id, value: { is_removed } },
        inverse: { id, value: { is_removed: !is_removed } },
      })
    );

    this.snackBarRef = this.openSnackBar('Notification removed', 'Undo');
    this.snackBarRef
      .onAction()
      .subscribe(() => this.store.dispatch(undoNotificationAction()));
  }

  onArchive(event: TArchivedUserNotification): void {
    const { id, is_archived } = event;

    this.store.dispatch(updateNotification({ id, is_archived }));
    this.store.dispatch(
      saveNotificationAction({
        action: { id, value: { is_archived } },
        inverse: { id, value: { is_archived: !is_archived } },
      })
    );

    this.snackBarRef = this.openSnackBar(
      is_archived ? 'Notification archived' : 'Notification unarchived',
      'Undo'
    );
    this.snackBarRef
      .onAction()
      .subscribe(() => this.store.dispatch(undoNotificationAction()));
  }

  onRead(event: TReadUserNotification): void {
    const { id, is_read } = event;

    this.store.dispatch(updateNotification({ id, is_read }));
    this.store.dispatch(
      saveNotificationAction({
        action: { id, value: { is_read } },
        inverse: { id, value: { is_read: !is_read } },
      })
    );

    this.snackBarRef = this.openSnackBar(
      is_read ? 'Notification read' : 'Notification unread',
      'Undo'
    );
    this.snackBarRef
      .onAction()
      .subscribe(() => this.store.dispatch(undoNotificationAction()));
  }

  onBulkUpdate(event: TBulkUpdateUserNotification): void {
    const { key, value, ids } = event;
    const bulkData = ids.map((id) => ({ id, [key]: value }));
    const bulkInverse = ids.map((id) => ({ id, [key]: !value }));
    this.store.dispatch(bulkUpdateNotifications({ data: bulkData }));
    this.store.dispatch(
      saveNotificationAction({
        action: { id: '', value: bulkData },
        inverse: { id: '', value: bulkInverse },
      })
    );

    let action: string;
    switch (key) {
      case 'is_removed':
        action = 'removed';
        break;
      case 'is_archived':
        action = 'archived';
        break;
      case 'is_read':
        action = value ? 'read' : 'unread';
        break;
    }

    this.snackBarRef = this.openSnackBar(
      `${ids.length} Notifications ${action}`,
      'Undo'
    );
    this.snackBarRef
      .onAction()
      .subscribe(() => this.store.dispatch(undoBulkNotificationAction()));
  }

  onPageChange(): void {
    this.onRefresh();
  }

  private openSnackBar(
    message: string,
    action: string
  ): MatSnackBarRef<TextOnlySnackBar> {
    return this.snackBar.open(message, action, {
      duration: 10000,
      horizontalPosition: 'right',
      verticalPosition: 'bottom',
    });
  }

  ngOnDestroy(): void {
    this.snackBarRef?.dismiss();
  }
}
