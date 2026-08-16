import { createAction, props } from '@ngrx/store';
import { TState } from './filter-user-notifications.reducer';

export const setFilterNotifications = createAction(
  '[User Notifications] Set Filter Notifications',
  props<{
    query: Readonly<TState>;
  }>()
);
