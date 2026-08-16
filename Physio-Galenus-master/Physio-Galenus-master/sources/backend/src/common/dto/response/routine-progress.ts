import { IRoutineProgress } from '@common-response-dto-interfaces/routine-progress.interface';
import { IWaypointTimestamp } from '@common-types/exercise.interface';
import { Exclude, Expose, Transform } from 'class-transformer';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class RoutineProgressDto implements IRoutineProgress {
  @Expose({ name: 'exercise' })
  @Transform(({ value: exercise }) => exercise.id)
  readonly exerciseId: string;

  @Expose({ name: 'current_set' })
  @Transform(({ value: current_set }) => current_set)
  @CustomApiProperty()
  readonly currentSet: number;

  @Expose({ name: 'next_set' })
  @Transform(({ value: next_set }) => next_set)
  @CustomApiProperty()
  readonly nextSet: number;

  @Expose({ name: 'max_sets' })
  @Transform(({ value: max_sets }) => max_sets)
  @CustomApiProperty()
  readonly maxSets: number;

  @Expose({ name: 'completion_time' })
  @Transform(({ value: completion_time }) => completion_time)
  @CustomApiProperty()
  readonly completionTime: number;

  @Expose({ name: 'waypoint_timestamps' })
  @Transform(({ value: waypoint_timestamps }) => waypoint_timestamps)
  readonly waypointTimestamps: IWaypointTimestamp[];

  @Expose({ name: 'mistakes' })
  @Transform(({ value: mistakes }) => mistakes)
  @CustomApiProperty()
  readonly mistakes: number;
}
