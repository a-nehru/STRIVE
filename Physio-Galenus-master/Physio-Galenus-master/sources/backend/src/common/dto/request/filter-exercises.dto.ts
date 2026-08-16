import { EExerciseType } from '@common-enums/exercise-type.enum';
import { ELimb } from '@common-enums/limbs.enum';
import { EPoseSide } from '@common-enums/pose-side.enum';
import { EPoseType } from '@common-enums/pose-type.enum';
import { IFilterExercises } from '@common-request-dto-interfaces/filter-exercises.interface';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PaginatedRequestDto } from './paginated-request.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class FilterExercisesDtoData implements IFilterExercises {
  @Expose()
  @IsOptional()
  @IsString()
  @CustomApiProperty()
  name?: string;

  @Expose()
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ELimb, { each: true })
  @CustomApiProperty()
  limbs?: ELimb[];

  @Expose()
  @IsOptional()
  @IsEnum(EPoseType)
  @CustomApiProperty()
  pose_type?: EPoseType;

  @Expose()
  @IsOptional()
  @IsEnum(EPoseSide)
  @CustomApiProperty()
  pose_side?: EPoseSide;

  @Expose()
  @IsOptional()
  @IsEnum(EExerciseType)
  @CustomApiProperty()
  exercise_type?: EExerciseType;
}

@Exclude()
export class FilterExercisesDto extends PaginatedRequestDto {
  @Expose()
  @ValidateNested()
  @Type(() => FilterExercisesDtoData)
  @CustomApiProperty()
  data: FilterExercisesDtoData;
}
