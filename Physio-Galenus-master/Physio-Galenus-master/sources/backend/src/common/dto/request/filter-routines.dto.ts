import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PaginatedRequestDto } from './paginated-request.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';
import { IFilterRoutines } from '@common-interfaces/filter-routines.interface';

@Exclude()
export class FilterRoutinesDtoData implements IFilterRoutines {
  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @CustomApiProperty()
  readonly exercise_ids?: string[];

  @Expose()
  @IsOptional()
  @IsString()
  @CustomApiProperty()
  readonly name?: string;

  @Expose()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @CustomApiProperty()
  readonly daysOfWeek?: string[];

  @Expose()
  @IsISO8601()
  @IsOptional()
  @CustomApiProperty()
  readonly routineStartDate?: string;

  @Expose()
  @IsISO8601()
  @IsOptional()
  @CustomApiProperty()
  readonly routineEndDate?: string;
}

@Exclude()
export class FilterRoutinesDto extends PaginatedRequestDto {
  @Expose()
  @ValidateNested()
  @Type(() => FilterRoutinesDtoData)
  @CustomApiProperty()
  data: FilterRoutinesDtoData;
}
