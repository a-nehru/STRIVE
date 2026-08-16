import { EDaysOfWeek } from '@common-enums/days-of-week.enum';
import { IUpsertRoutine } from '@common-request-dto-interfaces/upsert-routine.interface';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { UpsertRoutineToExerciseDto } from './upsert-routine-to-exercise.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class UpsertRoutineDto implements IUpsertRoutine {
  @Expose()
  @IsNotEmpty()
  @IsString()
  @CustomApiProperty()
  readonly name: string;

  @Expose()
  @IsNotEmpty()
  @IsISO8601()
  @CustomApiProperty()
  readonly start_date: string;

  @Expose()
  @IsNotEmpty()
  @IsISO8601()
  @CustomApiProperty()
  readonly end_date: string;

  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @IsNotEmpty({ each: true })
  @IsEnum(EDaysOfWeek, { each: true })
  @CustomApiProperty()
  readonly repetition_weekdays: EDaysOfWeek[];

  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested()
  @IsNotEmpty({ each: true })
  @Type(() => UpsertRoutineToExerciseDto)
  @CustomApiProperty()
  readonly routine_to_exercise: UpsertRoutineToExerciseDto[];
}
