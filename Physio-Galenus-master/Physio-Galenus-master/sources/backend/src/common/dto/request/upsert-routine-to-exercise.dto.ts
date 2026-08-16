import { IUpsertRoutineToExercise } from '@common-request-dto-interfaces/upsert-routine-to-exercise.interface';
import { Exclude, Expose } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class UpsertRoutineToExerciseDto implements IUpsertRoutineToExercise {
  @Expose()
  @IsNotEmpty()
  @IsString()
  @CustomApiProperty()
  exercise_id: string;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  sets: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  rest_between_sets: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  reps: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  time: number;
}
