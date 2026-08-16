import { EExerciseType } from '@common-enums/exercise-type.enum';
import { ELimb } from '@common-enums/limbs.enum';
import { EPoseSide } from '@common-enums/pose-side.enum';
import { EPoseType } from '@common-enums/pose-type.enum';
import {
  IExercise,
  IExerciseMetadata,
  IExerciseWaypoint,
  IJoint,
} from '@common-types/exercise.interface';
import { Exclude, Expose, Transform } from 'class-transformer';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class FullExerciseDto implements IExercise {
  @Expose()
  @CustomApiProperty()
  id: string;

  @Expose()
  @CustomApiProperty()
  name: string;

  @Expose()
  @CustomApiProperty()
  type: EExerciseType;

  @Expose()
  @CustomApiProperty()
  sets: number;

  @Expose()
  @CustomApiProperty()
  reps: number;

  @Expose()
  @CustomApiProperty()
  time: number;

  @Expose({ name: 'rest_between_sets' })
  @CustomApiProperty()
  @Transform(({ value: rest_between_sets }) => rest_between_sets)
  restBetweenSets: number;

  @Expose()
  @CustomApiProperty()
  joints: IJoint[];

  @Expose({ name: 'pose_type' })
  @CustomApiProperty()
  @Transform(({ value: pose_type }) => pose_type)
  poseType: EPoseType;

  @Expose({ name: 'pose_side' })
  @CustomApiProperty()
  @Transform(({ value: pose_side }) => pose_side)
  poseSide: EPoseSide;

  @Expose()
  @CustomApiProperty()
  waypoints: IExerciseWaypoint[];

  @Expose()
  @CustomApiProperty()
  metadata: IExerciseMetadata;
}
