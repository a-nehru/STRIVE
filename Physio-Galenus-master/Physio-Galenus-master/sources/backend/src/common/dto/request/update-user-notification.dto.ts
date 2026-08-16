import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class UpdateUserNotificationDto {
  @Expose()
  @IsOptional()
  @IsString()
  @CustomApiProperty()
  id?: string; // Used only in bulk update

  @Expose()
  @IsOptional()
  @IsBoolean()
  @CustomApiProperty()
  is_archived?: boolean;

  @Expose()
  @IsOptional()
  @IsBoolean()
  @CustomApiProperty()
  is_read?: boolean;

  @Expose()
  @IsOptional()
  @IsBoolean()
  @CustomApiProperty()
  is_notified?: boolean;

  @Expose()
  @IsOptional()
  @IsBoolean()
  @CustomApiProperty()
  is_removed?: boolean;
}

/** This Dto is used for bulk updates */
@Exclude()
export class UpdateUserNotificationDtoData {
  @Expose()
  @ValidateNested()
  @Type(() => UpdateUserNotificationDto)
  @CustomApiProperty()
  data: UpdateUserNotificationDto[];
}
