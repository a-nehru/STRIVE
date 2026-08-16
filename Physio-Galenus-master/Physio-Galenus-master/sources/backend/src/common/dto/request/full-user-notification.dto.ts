import { Exclude, Expose } from 'class-transformer';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class FullUserNotification {
  @Expose()
  @CustomApiProperty()
  id: string;

  @Expose()
  @CustomApiProperty()
  is_read: boolean;

  @Expose()
  @CustomApiProperty()
  is_archived: boolean;

  @Expose()
  @CustomApiProperty()
  is_notified: boolean;

  @Expose()
  @CustomApiProperty()
  notification_date: Date;
}
