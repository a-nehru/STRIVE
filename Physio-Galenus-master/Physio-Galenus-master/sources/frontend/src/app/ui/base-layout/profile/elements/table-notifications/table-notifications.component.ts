import { SelectionModel } from '@angular/cdk/collections';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AuthService } from '@client-services/auth.service';
import { UserNotificationDetailsForListDto } from '@common-response-dto/user-notification-details-for-list.dto';
import {
  checkPermissions,
  EPermission,
  EPermissionAction,
  IPermission,
} from '@common/permissions';

export type TReadUserNotification = { id: string; is_read: boolean };
export type TArchivedUserNotification = { id: string; is_archived: boolean };
export type TBulkUpdateUserNotification = {
  key: 'is_read' | 'is_archived' | 'is_removed';
  value: boolean;
  ids: string[];
};

@Component({
  selector: 'app-table-notifications',
  templateUrl: './table-notifications.component.html',
  styleUrls: ['./table-notifications.component.scss'],
})
export class TableNotificationsComponent {
  private _notifications: UserNotificationDetailsForListDto | null;

  @Input() canArchive: boolean;
  @Input() canRead: boolean;
  @Input() canRemove: boolean;
  @Input() canDelete: boolean; // nonrecoverable
  @Input() canRestore: boolean;

  get notifications(): UserNotificationDetailsForListDto | null {
    return this._notifications;
  }

  @Input()
  set notifications(data: UserNotificationDetailsForListDto | null) {
    this._notifications = data;

    if (!this._notifications?.data?.length) {
      this.selection.clear();
    }
  }

  @Output() readEvent = new EventEmitter<TReadUserNotification>();
  @Output() archiveEvent = new EventEmitter<TArchivedUserNotification>();
  @Output() removeEvent = new EventEmitter<string>();
  @Output() deleteEvent = new EventEmitter<string[]>();
  @Output() restoreEvent = new EventEmitter<string[]>();
  @Output() bulkUpdateEvent = new EventEmitter<TBulkUpdateUserNotification>();

  selection = new SelectionModel<string>(true, []);

  updateNotificationPermissions = [
    {
      id: EPermission.ManageUserNotifications,
      actions: [EPermissionAction.Edit],
    },
  ];
  deleteNotificationPermissions = [
    {
      id: EPermission.ManageUserNotifications,
      actions: [EPermissionAction.Delete],
    },
  ];

  constructor(private authService: AuthService) {}

  hasPermissions(permissionList: IPermission[]): boolean {
    const permissions = checkPermissions(
      this.authService.userSubject.value,
      permissionList
    );
    return permissions.length === 0;
  }

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected(): boolean {
    const numSelected = this.selection.selected.length;
    const numRows = this.notifications?.data?.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
      return;
    }

    if (this.notifications?.data) {
      this.selection.select(
        ...this.notifications.data.map((notification) => notification.id)
      );
    }
  }

  /** Whether the selected elements are marked as read. */
  isAllSelectedRead(): boolean {
    const notifications = this.notifications?.data.filter((notification) =>
      this.selection.selected.includes(notification.id)
    );
    return notifications
      ? notifications.every((notification) => notification.is_read)
      : false;
  }

  onDelete(): void {
    const { selected } = this.selection;
    this.deleteEvent.emit(selected);
  }

  onRestore(): void {
    const { selected } = this.selection;
    this.restoreEvent.emit(selected);
  }

  onBulkUpdate(selection: { key: string; value: boolean }): void {
    const { selected: ids } = this.selection;
    const { key, value } = selection;

    const data = { key, value, ids } as TBulkUpdateUserNotification;
    this.bulkUpdateEvent.emit(data);
  }
}
