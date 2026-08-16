import { Exclude, Expose, Type } from 'class-transformer';
import { PaginatedRequestDto } from './paginated-request.dto';
import {
  IsBooleanString,
  IsOptional,
  ValidateNested,
  IsISO8601,
  IsString,
} from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class FilterUserNotificationsDtoData {
  @Expose()
  @IsOptional()
  @IsBooleanString()
  @CustomApiProperty()
  readonly is_notified?: boolean;

  @Expose()
  @IsOptional()
  @IsBooleanString()
  @CustomApiProperty()
  readonly is_read?: boolean;

  @Expose()
  @IsOptional()
  @IsBooleanString()
  @CustomApiProperty()
  readonly is_archived?: boolean;

  @Expose()
  @IsOptional()
  @IsBooleanString()
  @CustomApiProperty()
  readonly is_removed?: boolean;

  @Expose()
  @IsOptional()
  @IsISO8601()
  @CustomApiProperty()
  readonly notification_date?: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  @CustomApiProperty()
  readonly start_date_range?: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  @CustomApiProperty()
  readonly end_date_range?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @CustomApiProperty()
  readonly subject?: string;
}

@Exclude()
export class FilterUserNotificationsDto extends PaginatedRequestDto {
  @Expose()
  @ValidateNested()
  @Type(() => FilterUserNotificationsDtoData)
  @CustomApiProperty()
  data: FilterUserNotificationsDtoData;
}
