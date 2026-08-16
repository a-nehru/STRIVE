import { Exclude, Expose, Type } from 'class-transformer';
import { ResponseDto } from './response.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';
import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { IPricingPlan } from '@common-interfaces/pricing-plan.interface';

@Exclude()
class PricingPlansListDtoData implements IPricingPlan {
  @Expose()
  @CustomApiProperty()
  type: EPricingPlanType;

  @Expose()
  @CustomApiProperty()
  number_of_supervised_patients: number;

  @Expose()
  @CustomApiProperty()
  rehabilitation_time_mins_day: number;

  @Expose()
  @CustomApiProperty()
  personalised_rehabilitation_routines_per_client: number;

  @Expose()
  @CustomApiProperty()
  exergames: number;

  @Expose()
  @CustomApiProperty()
  technical_support: boolean;

  @Expose()
  @CustomApiProperty()
  reports_and_metrics: boolean;

  @Expose()
  @CustomApiProperty()
  remote_asistance: boolean;

  @Expose()
  @CustomApiProperty()
  automatic_exercise_difficulty_adaptation: boolean;

  @Expose()
  @CustomApiProperty()
  videos_recorded_by_the_therapist: boolean;

  @Expose()
  @CustomApiProperty()
  mobile_app_for_patients: boolean;

  @Expose()
  @CustomApiProperty()
  customized_exergames: boolean;

  @Expose()
  @CustomApiProperty()
  customized_exercises: boolean;

  @Expose()
  @CustomApiProperty()
  automatic_routine_recommendation: boolean;

  @Expose()
  @CustomApiProperty()
  mobile_app_for_therapists: boolean;

  @Expose()
  @CustomApiProperty()
  personalised_alerts_and_notifications: boolean;

  @Expose()
  @CustomApiProperty()
  mobile_tracking_support: boolean;

  @Expose()
  @CustomApiProperty()
  hand_rehabilitation: boolean;

  @Expose()
  @CustomApiProperty()
  number_of_trial_days: number;

  @Expose()
  @CustomApiProperty()
  price: number;
}

@Exclude()
export class PricingPlansListDto extends ResponseDto {
  @Expose()
  @Type(() => PricingPlansListDtoData)
  @CustomApiProperty()
  data: PricingPlansListDtoData[];
}
