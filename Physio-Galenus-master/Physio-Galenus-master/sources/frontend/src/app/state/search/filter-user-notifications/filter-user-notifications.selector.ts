import { createSelector } from '@ngrx/store';
import * as fromRoot from '../../';

const selectSearch = (state: fromRoot.IState) => state.search;

export const selectFilterUserNotification = createSelector(
  selectSearch,
  (state) => state.filterUserNotifications
);
