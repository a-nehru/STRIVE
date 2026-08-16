import { Injectable } from '@angular/core';
import { catchError, map, mergeMap, delay } from 'rxjs/operators';
import { Actions, concatLatestFrom, createEffect, ofType } from '@ngrx/effects';
import { EMPTY } from 'rxjs';
import { UserNotificationService } from '@client-services/user-notification.service';
import { Store } from '@ngrx/store';
import { selectNotificationActions } from './user-notifications.selectors';
import {
  retrieveNotifications,
  loadNotifications,
  notifyNotifications,
  undoNotificationAction,
  updateNotification,
  bulkUpdateNotifications,
  undoBulkNotificationAction,
  updateNotifiedNotifications,
} from './user-notifications.actions';
import { selectFilterUserNotification } from '../../search/filter-user-notifications';
import { IState } from '../../';
import { ToastrService } from 'ngx-toastr';
import { hideLoading } from '../../search/shared-params';
import { appConfig } from '@config/app.config';

@Injectable()
export class UserNotificationEffects {
  readonly loadNotifications$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadNotifications),
      mergeMap(({ query }) =>
        this.notificationService.list(query).pipe(
          map(
            (notifications) => retrieveNotifications({ notifications }),
            catchError(() => EMPTY)
          )
        )
      )
    )
  );

  readonly hideLoading$ = createEffect(() =>
    this.actions$.pipe(
      ofType(retrieveNotifications),
      delay(appConfig.minimumLoadTimeInMs), // Simulate huge amount of data
      map(
        () => hideLoading(),
        catchError(() => EMPTY)
      )
    )
  );

  readonly notifyNotifications$ = createEffect(() =>
    this.actions$.pipe(
      ofType(notifyNotifications),
      mergeMap(() =>
        this.notificationService
          .list({
            data: {
              is_notified: false,
              notification_date: new Date().toISOString(),
            },
          })
          .pipe(
            map(
              (notifications) =>
                updateNotifiedNotifications({
                  data: notifications.data.map((notification) => ({
                    id: notification.id,
                    is_notified: true,
                  })),
                }),
              catchError(() => EMPTY)
            )
          )
      )
    )
  );

  readonly updateNotifiedNotifications$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(updateNotifiedNotifications),
        mergeMap(({ type, ...dto }) =>
          this.notificationService.bulkUpdate(dto).pipe(
            map(
              (notifications) =>
                notifications.data.length > 0 &&
                this.toastrService.info(
                  `You have ${notifications.data.length}
                  notifications for today. Go to your profile to see more details`,
                  'User Notifications',
                  { timeOut: 500000 }
                ),
              catchError(() => EMPTY)
            )
          )
        )
      ),
    { dispatch: false }
  );

  readonly updateNotification$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateNotification),
      concatLatestFrom(() => this.store.select(selectFilterUserNotification)),
      mergeMap(([{ id, type, ...action }, query]) =>
        this.notificationService.update(id, { ...action }).pipe(
          map(
            () => loadNotifications({ query }),
            catchError(() => EMPTY)
          )
        )
      )
    )
  );

  readonly bulkUpdateNotifications$ = createEffect(() =>
    this.actions$.pipe(
      ofType(bulkUpdateNotifications),
      concatLatestFrom(() => this.store.select(selectFilterUserNotification)),
      mergeMap(([{ type, ...dto }, query]) =>
        this.notificationService.bulkUpdate(dto).pipe(
          map(
            () => loadNotifications({ query }),
            catchError(() => EMPTY)
          )
        )
      )
    )
  );

  readonly undoUpdatedNotification$ = createEffect(() =>
    this.actions$.pipe(
      ofType(undoNotificationAction),
      concatLatestFrom(() => [
        this.store.select(selectNotificationActions),
        this.store.select(selectFilterUserNotification),
      ]),
      mergeMap(([, { inverse }, query]) =>
        this.notificationService.update(inverse.id, { ...inverse.value }).pipe(
          map(
            () => loadNotifications({ query }),
            catchError(() => EMPTY)
          )
        )
      )
    )
  );

  readonly undoBulkUpdatedNotification$ = createEffect(() =>
    this.actions$.pipe(
      ofType(undoBulkNotificationAction),
      concatLatestFrom(() => [
        this.store.select(selectNotificationActions),
        this.store.select(selectFilterUserNotification),
      ]),
      mergeMap(([, { inverse }, query]) =>
        this.notificationService.bulkUpdate({ data: inverse.value as [] }).pipe(
          map(
            () => loadNotifications({ query }),
            catchError(() => EMPTY)
          )
        )
      )
    )
  );

  constructor(
    private store: Store<IState>,
    private actions$: Actions,
    private toastrService: ToastrService,
    private notificationService: UserNotificationService
  ) {}
}
