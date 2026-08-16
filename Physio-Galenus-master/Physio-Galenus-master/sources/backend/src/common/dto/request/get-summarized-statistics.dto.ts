import { IGetSummarizedStatistics } from '@common-request-dto-interfaces/get-summarized-statistics.interface';
import { Exclude, Expose } from 'class-transformer';
import { IsBoolean, IsBooleanString, IsOptional } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class GetSummarizedStatisticsDto implements IGetSummarizedStatistics {
  @Expose()
  @IsOptional()
  @IsBooleanString()
  @CustomApiProperty()
  readonly patientStatistics?: boolean;

  @Expose()
  @IsOptional()
  @IsBooleanString()
  @CustomApiProperty()
  readonly routineStatistics?: boolean;

  @Expose()
  @IsOptional()
  @IsBooleanString()
  @CustomApiProperty()
  readonly therapistStatistics?: boolean;
}
