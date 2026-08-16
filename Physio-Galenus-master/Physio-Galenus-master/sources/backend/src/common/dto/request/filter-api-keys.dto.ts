import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsBooleanString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { EApiKeyQuotaReset } from '../../enums/api-key-quota-reset.enum';
import { PaginatedRequestDto } from './paginated-request.dto';

@Exclude()
class Data {
  @Expose()
  @IsOptional()
  @IsString()
  @CustomApiProperty()
  key?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @CustomApiProperty()
  username?: string;

  @Expose()
  @IsOptional()
  @IsBooleanString()
  @CustomApiProperty()
  is_revoked?: boolean;

  @Expose()
  @IsOptional()
  @IsEnum(EApiKeyQuotaReset)
  @CustomApiProperty()
  quota_reset?: EApiKeyQuotaReset;
}

@Exclude()
export class FilterApiKeysDto extends PaginatedRequestDto {
  @Expose()
  @ValidateNested()
  @Type(() => Data)
  @CustomApiProperty()
  data: Data;
}
