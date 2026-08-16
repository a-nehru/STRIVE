import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { RequestDto } from './request.dto';
import { EApiKeyQuotaReset } from '../../enums/api-key-quota-reset.enum';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
class DtoData {
  @Expose()
  @IsString()
  @IsNotEmpty()
  @CustomApiProperty()
  userId: string;

  @Expose()
  @IsBoolean()
  @IsOptional()
  @CustomApiProperty()
  is_revoked?: boolean;

  @Expose()
  @IsString()
  @IsOptional()
  @CustomApiProperty()
  description?: string;

  @Expose()
  @IsNumberString()
  @IsOptional()
  @CustomApiProperty()
  quota?: bigint;

  @Expose()
  @IsEnum(EApiKeyQuotaReset)
  @IsNotEmpty()
  @CustomApiProperty()
  quota_reset: EApiKeyQuotaReset;
}

@Exclude()
export class CreateApiKeyDto extends RequestDto {
  @Expose()
  @ValidateNested()
  @Type(() => DtoData)
  @CustomApiProperty()
  data: DtoData;
}
