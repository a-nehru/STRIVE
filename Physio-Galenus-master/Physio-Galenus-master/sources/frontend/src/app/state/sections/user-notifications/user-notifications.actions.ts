import { createAction, props } from '@ngrx/store';
import {
  createSaveApiAction,
  createUndoApiAction,
} from '../../history/undo-api';
import {
  TBulkUpdateState,
  TState,
  TUpdateState,
} from './user-notifications.reducer';
import * as fromFilterUserNotifications from '../../search/filter-user-notifications';

export const loadNotifications = createAction(
  '[User Notifications] Load Notifications',
  props<{
    query: Readonly<fromFilterUserNotifications.TState>;
  }>()
);

export const notifyNotifications = createAction(
  '[User Notifications] Notify Notifications'
);

export const updateNotifiedNotifications = createAction(
  '[User Notifications] Update Notified Notifications',
  props<Readonly<TBulkUpdateState>>()
);

export const retrieveNotifications = createAction(
  '[User Notifications] Retrieve Notifications',
  props<{
    notifications: Readonly<TState>;
  }>()
);

export const updateNotification = createAction(
  '[User Notifications] Update Notification',
  props<Readonly<TUpdateState>>()
);

export const bulkUpdateNotifications = createAction(
  '[User Notifications] Bulk Update Notifications',
  props<Readonly<TBulkUpdateState>>()
);

export const undoNotificationAction = createUndoApiAction(
  '[User Notifications] Undo Notification Action'
);

export const undoBulkNotificationAction = createUndoApiAction(
  '[User Notifications] Undo Bulk Notification Action'
);

export const saveNotificationAction = createSaveApiAction(
  '[User Notifications] Save Notification Action'
);
