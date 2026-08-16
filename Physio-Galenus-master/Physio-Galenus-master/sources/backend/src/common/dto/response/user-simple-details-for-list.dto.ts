import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { PaginatedResponseDto } from './paginated-response.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class SimpleUserDtoData {
  @Expose()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @CustomApiProperty()
  readonly username: string;

  @Expose()
  @Transform(({ value: pricing_plan }) => pricing_plan?.type)
  @CustomApiProperty()
  readonly pricing_plan?: EPricingPlanType;
}

@Exclude()
export class UserSimpleDetailsForListDto extends PaginatedResponseDto {
  @Expose()
  @Type(() => SimpleUserDtoData)
  @CustomApiProperty()
  data: SimpleUserDtoData[];
}
