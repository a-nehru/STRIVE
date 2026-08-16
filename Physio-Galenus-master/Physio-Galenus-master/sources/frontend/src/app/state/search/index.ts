import { combineReducers } from '@ngrx/store';
import * as fromFilterUserNotifications from './filter-user-notifications';
import * as fromSharedParams from './shared-params';

export interface IState {
  filterUserNotifications: fromFilterUserNotifications.TState;
  sharedParams: fromSharedParams.TState;
}

export const reducer = combineReducers({
  filterUserNotifications: fromFilterUserNotifications.reducer,
  sharedParams: fromSharedParams.reducer,
});
