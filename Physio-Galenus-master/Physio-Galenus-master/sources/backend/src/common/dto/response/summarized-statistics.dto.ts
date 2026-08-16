import { Exclude, Expose, Transform, Type } from 'class-transformer';
import {
  IPatientSummarizedStatistics,
  IRoutineSummarizedStatistics,
  ISummarizedStatistics,
  ITherapistSummarizedStatistics,
} from '@common-response-dto-interfaces/summarized-statistics.interface';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class PatientSummarizedStatisticsDto
  implements IPatientSummarizedStatistics
{
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  readonly numberOfPatients: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  readonly newPatientsThisMonth: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  readonly newPatientsThisYear: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  readonly newPatientsLastYear: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  readonly newPatientsLastMonth: number;
}

@Exclude()
export class RoutineSummarizedStatisticsDto
  implements IRoutineSummarizedStatistics
{
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  readonly numberOfRoutines: number;
}

@Exclude()
export class TherapistSummarizedStatisticsDto
  implements ITherapistSummarizedStatistics
{
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  readonly numberOfDaysSinceRegistration: number;

  @Expose()
  @IsOptional()
  @IsEnum(() => EPricingPlanType)
  @CustomApiProperty()
  readonly princingPlan: EPricingPlanType;
}

@Exclude()
export class SummarizedStatisticsDto implements ISummarizedStatistics {
  @Expose()
  @IsOptional()
  @Type(() => PatientSummarizedStatisticsDto)
  @CustomApiProperty()
  readonly patientStatistics?: PatientSummarizedStatisticsDto;

  @Expose()
  @IsOptional()
  @Type(() => RoutineSummarizedStatisticsDto)
  @CustomApiProperty()
  readonly routineStatistics?: RoutineSummarizedStatisticsDto;

  @Expose()
  @IsOptional()
  @Type(() => TherapistSummarizedStatisticsDto)
  @CustomApiProperty()
  readonly therapistStatistics?: TherapistSummarizedStatisticsDto;
}
