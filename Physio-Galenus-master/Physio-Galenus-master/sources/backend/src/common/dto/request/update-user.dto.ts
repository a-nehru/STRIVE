import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { Exclude, Expose } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class UpdateUserDto {
  @Expose()
  @IsNotEmpty()
  @IsString()
  @CustomApiProperty()
  readonly username: string;

  @Expose()
  @IsNotEmpty()
  @IsEnum(EPricingPlanType)
  @CustomApiProperty()
  readonly pricingPlan: EPricingPlanType;
}
