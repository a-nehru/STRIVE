import { IPermission } from '@common-response-dto-interfaces/permission.interface';
import { Exclude, Expose } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class PermissionDto implements IPermission {
  @Expose()
  @IsString()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @MaxLength(100)
  @IsString()
  @CustomApiProperty()
  readonly name?: string;

  @Expose()
  @MaxLength(255)
  @IsString()
  @CustomApiProperty()
  readonly description?: string;

  @Expose()
  @IsBoolean()
  @IsOptional()
  @CustomApiProperty()
  can_create?: boolean;

  @Expose()
  @IsBoolean()
  @IsOptional()
  @CustomApiProperty()
  can_edit?: boolean;

  @Expose()
  @IsBoolean()
  @IsOptional()
  @CustomApiProperty()
  can_read?: boolean;

  @Expose()
  @IsBoolean()
  @IsOptional()
  @CustomApiProperty()
  can_delete?: boolean;

  @Expose()
  @IsBoolean()
  @IsOptional()
  @CustomApiProperty()
  can_list?: boolean;
}
