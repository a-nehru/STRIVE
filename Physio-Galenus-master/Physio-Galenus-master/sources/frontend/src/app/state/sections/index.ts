import { combineReducers } from '@ngrx/store';
import * as fromUserNotifications from './user-notifications';
import * as fromRemovedUserNotifications from './removed-user-notifications';

export interface IState {
  userNotifications: fromUserNotifications.TState;
  removedUserNotifications: fromRemovedUserNotifications.TState;
}

export const reducer = combineReducers({
  userNotifications: fromUserNotifications.reducer,
  removedUserNotifications: fromRemovedUserNotifications.reducer,
});
