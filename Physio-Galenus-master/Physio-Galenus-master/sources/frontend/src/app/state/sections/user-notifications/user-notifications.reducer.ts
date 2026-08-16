import {
  UpdateUserNotificationDto,
  UpdateUserNotificationDtoData,
} from '@common-request-dto/update-user-notification.dto';
import { UserNotificationDetailsForListDto } from '@common-response-dto/user-notification-details-for-list.dto';
import { createReducer, on } from '@ngrx/store';
import { retrieveNotifications } from './user-notifications.actions';

export type TState = UserNotificationDetailsForListDto;
export type TUpdateState = { id: string } & UpdateUserNotificationDto;
export type TBulkUpdateState = UpdateUserNotificationDtoData;

const initialState: Readonly<TState> = {
  data: [],
};

export const reducer = createReducer(
  initialState,
  on(retrieveNotifications, (state, { notifications }) => notifications)
);
