import { combineReducers } from '@ngrx/store';
import * as fromUndoApi from './undo-api';
import { saveNotificationAction as UserNotificationSave } from '../sections/user-notifications/user-notifications.actions';
import { saveNotificationAction as RemovedUserNotificationSave } from '../sections/removed-user-notifications/removed-user-notifications.actions';

export interface IState {
  userNotifications: fromUndoApi.TState;
  removedUserNotifications: fromUndoApi.TState;
}

export const reducer = combineReducers({
  userNotifications: fromUndoApi.reducer(UserNotificationSave.type),
  removedUserNotifications: fromUndoApi.reducer(
    RemovedUserNotificationSave.type
  ),
});
