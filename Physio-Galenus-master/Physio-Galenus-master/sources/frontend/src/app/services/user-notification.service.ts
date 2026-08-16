import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { objectToQueryString } from '@common/utils/network-utils';
import { userNotifEndpoint } from '@config/endpoints.config';
import { BehaviorSubject, Observable } from 'rxjs';
import { FilterUserNotificationsDto } from '@common-request-dto/filter-user-notifications.dto';
import { FullUserNotification } from '@common-request-dto/full-user-notification.dto';
import {
  UpdateUserNotificationDto,
  UpdateUserNotificationDtoData,
} from '@common-request-dto/update-user-notification.dto';
import { UserNotificationDetailsForListDto } from '@common-response-dto/user-notification-details-for-list.dto';

@Injectable({ providedIn: 'root' })
export class UserNotificationService {
  constructor(private readonly http: HttpClient) {}

  list(
    query: FilterUserNotificationsDto
  ): Observable<UserNotificationDetailsForListDto> {
    const queryString = objectToQueryString(query);
    return this.http.get<UserNotificationDetailsForListDto>(
      `${userNotifEndpoint.$full}?${queryString}`
    );
  }

  update(
    id: string,
    dto: UpdateUserNotificationDto
  ): Observable<FullUserNotification> {
    return this.http.patch<FullUserNotification>(
      `${userNotifEndpoint.$full}/${id}`,
      dto
    );
  }

  delete(ids: string[]): Observable<boolean> {
    return this.http.post<boolean>(`${userNotifEndpoint.delete.$full}`, {
      ids,
    });
  }

  bulkUpdate(
    dto: UpdateUserNotificationDtoData
  ): Observable<UserNotificationDetailsForListDto> {
    return this.http.patch<UserNotificationDetailsForListDto>(
      `${userNotifEndpoint.update.$full}`,
      dto
    );
  }
}
