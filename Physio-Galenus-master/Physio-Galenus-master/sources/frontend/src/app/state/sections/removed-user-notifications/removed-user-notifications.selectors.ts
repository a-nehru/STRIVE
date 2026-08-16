import { createSelector } from '@ngrx/store';
import * as fromRoot from '../..';

const selectSection = (state: fromRoot.IState) => state.sections;
const selectHistory = (state: fromRoot.IState) => state.history;

export const selectNotifications = createSelector(
  selectSection,
  (state) => state.removedUserNotifications
);

export const selectNotificationActions = createSelector(
  selectHistory,
  (state) => state.removedUserNotifications
);
