import {
  IMovementCompensation,
  IUpsertRoutineProgress,
} from '@common-request-dto-interfaces/upsert-routine-progress.interface';
import { IWaypointTimestamp } from '@common-types/exercise.interface';
import { Exclude, Expose } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class MovementCompensation implements IMovementCompensation {
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  compensation: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  validity: number;
}

@Exclude()
export class UpsertRoutineProgressDto implements IUpsertRoutineProgress {
  @Expose()
  @IsNotEmpty()
  @IsString()
  @CustomApiProperty()
  exerciseId: string;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  currentSet: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  nextSet: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  maxSets: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @CustomApiProperty()
  completionTime: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @CustomApiProperty()
  completion: number;

  @Expose()
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @CustomApiProperty()
  reps: number;

  @Expose()
  @IsNotEmpty()
  @IsArray()
  @CustomApiProperty()
  movementCompensations: MovementCompensation[][];

  @Expose()
  @IsNotEmpty()
  @IsArray()
  @CustomApiProperty()
  movementSpeeds: number[];

  @Expose()
  @IsNotEmpty()
  @IsArray()
  @CustomApiProperty()
  repetitionTimes: number[];

  @Expose()
  @IsNotEmpty()
  @IsArray()
  @CustomApiProperty()
  repetitionMistakes: number[];

  @Expose()
  @IsNotEmpty()
  @IsArray()
  @CustomApiProperty()
  waypointTimestamps: IWaypointTimestamp[];

  @CustomApiProperty()
  mistakes: number;
}
