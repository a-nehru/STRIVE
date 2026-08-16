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
  deleteNotifications,
  loadRemovedNotifications,
  restoreNotifications,
  saveNotificationAction,
  selectNotifications,
  undoBulkNotificationAction,
  undoNotificationAction,
  updateNotification,
} from 'src/app/state/sections/removed-user-notifications';
import {
  TBulkUpdateUserNotification,
  TReadUserNotification,
} from '../elements/table-notifications/table-notifications.component';
import { IState } from 'src/app/state';
import { ConfirmDialogService } from '@client-services/confirm-dialog.service';
import { showLoading } from 'src/app/state/search/shared-params';
import { selectIsLoading } from 'src/app/state/search/shared-params/shared-params.selector';

type TState = {
  heading: string;
  subheading: string;
  headingIcon: string;
};

@Component({
  selector: 'app-removed-user-notifications',
  templateUrl: './removed-user-notifications.component.html',
  styleUrls: ['./removed-user-notifications.component.scss'],
})
export class RemovedUserNotificationsComponent implements OnInit, OnDestroy {
  state: TState = {
    heading: 'Removed Notifications',
    subheading: 'List of removed notifications',
    headingIcon: 'delete',
  };

  paginationData: IPaginationData = {
    pageSize: paginationConfig.defaultPageSize,
    page: 0,
  };
  paginationOptions: IPaginationOptions = {
    pageSizeOptions: paginationConfig.defaultPageSizeOptions,
  };

  isLoading$ = this.store.select(selectIsLoading);
  notifications$ = this.store.select(selectNotifications);

  private snackBarRef: MatSnackBarRef<TextOnlySnackBar>;

  constructor(
    private store: Store<IState>,
    private snackBar: MatSnackBar,
    private confirmDialogService: ConfirmDialogService
  ) {
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
        is_removed: true,
      },
      metadata: {
        ...this.paginationData,
        orderBy: { 'userNotification.audit_dates.created_at': 'DESC' },
      },
    } as FilterUserNotificationsDto;

    this.store.dispatch(setFilterNotifications({ query }));

    this.store.dispatch(showLoading());
    this.store.dispatch(loadRemovedNotifications({ query }));
  }

  async onDelete(ids: string[]): Promise<void> {
    if (
      !(await this.confirmDialogService.confirm(
        'Delete notifications',
        'Are you sure you want to delete permanently the selected notifications?'
      ))
    ) {
      return;
    }

    this.store.dispatch(showLoading());
    this.store.dispatch(deleteNotifications({ ids }));
  }

  onRestore(ids: string[]): void {
    const bulkData = ids.map((id) => ({ id, is_removed: false }));
    const bulkInverse = ids.map((id) => ({ id, is_removed: true }));
    this.store.dispatch(restoreNotifications({ data: bulkData }));
    this.store.dispatch(
      saveNotificationAction({
        action: { id: '', value: bulkData },
        inverse: { id: '', value: bulkInverse },
      })
    );

    this.snackBarRef = this.openSnackBar(
      `${ids.length} notifications restored`,
      'Undo'
    );
    this.snackBarRef
      .onAction()
      .subscribe(() => this.store.dispatch(undoBulkNotificationAction()));
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

    this.snackBarRef = this.openSnackBar(
      `${ids.length} notifications ${value ? 'read' : 'unread'}`,
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
