import { IAutonomousExercises } from '@common-response-dto-interfaces/autonomous-exercises.interface';
import { Exclude, Expose, Transform } from 'class-transformer';
import { FullExerciseDto } from './full-exercise.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class AutonomousExercisesDto implements IAutonomousExercises {
  @Expose({ name: 'exercises' })
  @Transform(({ value: exercises }) => {
    const output: FullExerciseDto[] = [];

    if (exercises) {
      for (const exercise of exercises) {
        if (exercise && exercise.autonomous_config) {
          const exr: FullExerciseDto = {
            id: exercise.id,
            name: exercise.name,
            type: exercise.type,
            sets: exercise.autonomous_config.sets,
            reps: exercise.autonomous_config.reps,
            time: exercise.autonomous_config.time,
            restBetweenSets: exercise.autonomous_config.rest_between_sets,
            joints: exercise.joints,
            poseType: exercise.pose_type,
            poseSide: exercise.pose_side,
            waypoints: exercise.waypoints,
            metadata: exercise.metadata,
          };
          output.push(exr);
        }
      }
    }

    return output;
  })
  @CustomApiProperty()
  readonly exercises: FullExerciseDto[];
}
