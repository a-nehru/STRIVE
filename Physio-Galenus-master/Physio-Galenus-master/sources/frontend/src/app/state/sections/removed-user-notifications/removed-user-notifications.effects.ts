import { Injectable } from '@angular/core';
import { catchError, map, mergeMap, delay } from 'rxjs/operators';
import { Actions, concatLatestFrom, createEffect, ofType } from '@ngrx/effects';
import { EMPTY } from 'rxjs';
import { UserNotificationService } from '@client-services/user-notification.service';
import { Store } from '@ngrx/store';
import { selectNotificationActions } from './removed-user-notifications.selectors';
import {
  retrieveRemovedNotifications,
  loadRemovedNotifications,
  undoNotificationAction,
  updateNotification,
  bulkUpdateNotifications,
  deleteNotifications,
  undoBulkNotificationAction,
  restoreNotifications,
  loadFromRestoredNotifications,
} from './removed-user-notifications.actions';
import { retrieveNotifications } from '../user-notifications/user-notifications.actions';
import { selectFilterUserNotification } from '../../search/filter-user-notifications';
import { IState } from '../..';
import { appConfig } from '@config/app.config';
import { hideLoading } from '../../search/shared-params';

@Injectable()
export class RemovedUserNotificationEffects {
  readonly loadRemovedNotifications$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadRemovedNotifications, loadFromRestoredNotifications),
      mergeMap(({ query }) =>
        this.notificationService.list(query).pipe(
          map(
            (notifications) => retrieveRemovedNotifications({ notifications }),
            catchError(() => EMPTY)
          )
        )
      )
    )
  );

  readonly loadNotifications$ = createEffect(() =>
    this.actions$.pipe(
      ofType(loadFromRestoredNotifications),
      mergeMap(() =>
        this.notificationService
          .list({ data: { is_archived: false, is_removed: false } })
          .pipe(
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
      ofType(retrieveRemovedNotifications),
      delay(appConfig.minimumLoadTimeInMs), // Simulate huge amount of data
      map(
        () => hideLoading(),
        catchError(() => EMPTY)
      )
    )
  );

  readonly updateNotification$ = createEffect(() =>
    this.actions$.pipe(
      ofType(updateNotification),
      concatLatestFrom(() => this.store.select(selectFilterUserNotification)),
      mergeMap(([{ id, ...action }, query]) =>
        this.notificationService.update(id, { ...action }).pipe(
          map(
            () => loadRemovedNotifications({ query }),
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
      mergeMap(([dto, query]) =>
        this.notificationService.bulkUpdate(dto).pipe(
          map(
            () => loadRemovedNotifications({ query }),
            catchError(() => EMPTY)
          )
        )
      )
    )
  );

  readonly deleteNotifications$ = createEffect(() =>
    this.actions$.pipe(
      ofType(deleteNotifications),
      concatLatestFrom(() => this.store.select(selectFilterUserNotification)),
      mergeMap(([{ ids }, query]) =>
        this.notificationService.delete(ids).pipe(
          map(
            () => loadRemovedNotifications({ query }),
            catchError(() => EMPTY)
          )
        )
      )
    )
  );

  readonly restoreNotifications$ = createEffect(() =>
    this.actions$.pipe(
      ofType(restoreNotifications),
      concatLatestFrom(() => this.store.select(selectFilterUserNotification)),
      mergeMap(([dto, query]) =>
        this.notificationService.bulkUpdate(dto).pipe(
          map(
            () => loadFromRestoredNotifications({ query }),
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
            () => loadRemovedNotifications({ query }),
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
            () => loadRemovedNotifications({ query }),
            catchError(() => EMPTY)
          )
        )
      )
    )
  );

  constructor(
    private store: Store<IState>,
    private actions$: Actions,
    private notificationService: UserNotificationService
  ) {}
}
