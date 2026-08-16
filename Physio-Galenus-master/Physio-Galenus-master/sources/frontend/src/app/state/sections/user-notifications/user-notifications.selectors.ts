import { createSelector } from '@ngrx/store';
import * as fromRoot from '../../';

const selectSection = (state: fromRoot.IState) => state.sections;
const selectHistory = (state: fromRoot.IState) => state.history;

export const selectNotifications = createSelector(
  selectSection,
  (state) => state.userNotifications
);

export const selectNotificationActions = createSelector(
  selectHistory,
  (state) => state.userNotifications
);

export const selectActiveNotifications = createSelector(
  selectNotifications,
  (notifications) => ({
    metadata: notifications.metadata,
    data: notifications.data.filter(
      (notification) =>
        !notification.is_read &&
        !notification.is_removed &&
        !notification.is_archived
    ),
  })
);
