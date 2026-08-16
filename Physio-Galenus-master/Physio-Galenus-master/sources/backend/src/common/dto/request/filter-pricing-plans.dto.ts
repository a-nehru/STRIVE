import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumberString,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { PaginatedRequestDto } from './paginated-request.dto';

@Exclude()
class Data {
  @Expose()
  @IsOptional()
  @IsEnum(EPricingPlanType)
  @CustomApiProperty()
  type?: EPricingPlanType;

  @Expose()
  @IsOptional()
  @IsNumberString()
  @CustomApiProperty()
  price?: number;
}

@Exclude()
export class FilterPricingPlansListDto extends PaginatedRequestDto {
  @Expose()
  @ValidateNested()
  @Type(() => Data)
  @CustomApiProperty()
  data: Data;
}
