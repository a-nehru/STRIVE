import { FilterUserNotificationsDto } from '@common-request-dto/filter-user-notifications.dto';
import { createReducer, on } from '@ngrx/store';
import { setFilterNotifications } from './filter-user-notifications.actions';

export type TState = FilterUserNotificationsDto;

const initialState: Readonly<TState> = { data: {} };

export const reducer = createReducer(
  initialState,
  on(setFilterNotifications, (state, { query }) => query)
);
