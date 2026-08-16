import { createAction, props } from '@ngrx/store';
import {
  createSaveApiAction,
  createUndoApiAction,
} from '../../history/undo-api';
import {
  TBulkUpdateState,
  TState,
  TUpdateState,
} from './removed-user-notifications.reducer';
import * as fromFilterUserNotifications from '../../search/filter-user-notifications';

export const loadRemovedNotifications = createAction(
  '[Removed User Notifications] Load Notifications',
  props<{
    query: Readonly<fromFilterUserNotifications.TState>;
  }>()
);

export const loadFromRestoredNotifications = createAction(
  '[Removed User Notifications] Load From Restored Notifications',
  props<{
    query: Readonly<fromFilterUserNotifications.TState>;
  }>()
);

export const retrieveRemovedNotifications = createAction(
  '[Removed User Notifications] Retrieve Notifications',
  props<{
    notifications: Readonly<TState>;
  }>()
);

export const updateNotification = createAction(
  '[Removed User Notifications] Update Notification',
  props<Readonly<TUpdateState>>()
);

export const bulkUpdateNotifications = createAction(
  '[Removed User Notifications] Bulk Update Notifications',
  props<Readonly<TBulkUpdateState>>()
);

export const deleteNotifications = createAction(
  '[Removed User Notifications] Delete Notifications',
  props<Readonly<{ ids: string[] }>>()
);

export const restoreNotifications = createAction(
  '[Removed User Notifications] Restore Delete Notifications',
  props<Readonly<TBulkUpdateState>>()
);

export const undoNotificationAction = createUndoApiAction(
  '[Removed User Notification] Undo Notification Action'
);

export const undoBulkNotificationAction = createUndoApiAction(
  '[Removed User Notification] Undo Bulk Notification Action'
);

export const saveNotificationAction = createSaveApiAction(
  '[Removed User Notification] Save Notification Action'
);
