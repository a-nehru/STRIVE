import { EDaysOfWeek } from '@common-enums/days-of-week.enum';
import { IFullRoutine } from '@common-response-dto-interfaces/full-routine.interface';
import { Exclude, Expose, Transform } from 'class-transformer';
import { FullExerciseDto } from './full-exercise.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class FullRoutineDto implements IFullRoutine {
  @Expose()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @CustomApiProperty()
  readonly name: string;

  @Expose({ name: 'start_date' })
  @Transform(({ value: start_date }) => new Date(start_date))
  @CustomApiProperty()
  readonly startDate: Date;

  @Expose({ name: 'end_date' })
  @Transform(({ value: end_date }) => new Date(end_date))
  @CustomApiProperty()
  readonly endDate: Date;

  @Expose({ name: 'repetition_weekdays' })
  @Transform(({ value: repetition_weekdays }) => repetition_weekdays)
  @CustomApiProperty()
  readonly repetitionWeekdays: EDaysOfWeek[];

  @Expose({ name: 'is_adjusting_difficulty' })
  @CustomApiProperty()
  readonly isAdjustingDifficulty: boolean;

  @Expose({ name: 'routine_to_exercise' })
  @Transform(({ value: routine_to_exercise }) => {
    const output: FullExerciseDto[] = [];

    if (routine_to_exercise) {
      for (const routineToExercise of routine_to_exercise) {
        if (routineToExercise && routineToExercise.exercise) {
          const exercise: FullExerciseDto = {
            id: routineToExercise.exercise.id,
            name: routineToExercise.exercise.name,
            type: routineToExercise.exercise.type,
            sets: routineToExercise.sets,
            reps: routineToExercise.reps,
            time: routineToExercise.time,
            restBetweenSets: routineToExercise.rest_between_sets,
            joints: routineToExercise.exercise.joints,
            poseType: routineToExercise.exercise.pose_type,
            poseSide: routineToExercise.exercise.pose_side,
            waypoints: routineToExercise.exercise.waypoints,
            metadata: routineToExercise.exercise.metadata,
          };
          output.push(exercise);
        }
      }
    }

    return output;
  })
  @CustomApiProperty()
  readonly exercises: FullExerciseDto[];
}
