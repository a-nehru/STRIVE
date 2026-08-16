import { Exclude, Expose, Type, Transform } from 'class-transformer';
import { IUserNotificationPayload } from '../../../database/entity';
import { PaginatedResponseDto } from './paginated-response.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class UserNotificationDetailsForListDtoData {
  @Expose()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @Transform(({ value: due_date }) =>
    due_date ? new Date(due_date) : undefined,
  )
  @CustomApiProperty()
  readonly due_date: string;

  @Expose()
  @Transform(({ value: notification_date }) =>
    notification_date ? new Date(notification_date) : undefined,
  )
  @CustomApiProperty()
  readonly notification_date: string;

  @Expose()
  @CustomApiProperty()
  readonly subject: string;

  // @Expose()
  // @Transform((_, obj) => obj && obj.reasonType && obj.reasonType.id)
  // @CustomApiProperty()
  readonly reasonType: number;

  @Expose()
  @CustomApiProperty()
  readonly message: string;

  @Expose()
  @CustomApiProperty()
  readonly is_notified: boolean;

  @Expose()
  @CustomApiProperty()
  readonly is_read: boolean;

  @Expose()
  @CustomApiProperty()
  readonly is_archived: boolean;

  @Expose()
  readonly is_removed: boolean;

  @Expose()
  @Transform(({ value: payload }) => payload)
  @CustomApiProperty()
  readonly payload: IUserNotificationPayload;
}

@Exclude()
export class UserNotificationDetailsForListDto extends PaginatedResponseDto {
  @Expose()
  @Type(() => UserNotificationDetailsForListDtoData)
  @CustomApiProperty()
  readonly data: UserNotificationDetailsForListDtoData[];
}
