import { EExerciseType } from '@common-enums/exercise-type.enum';
import { ELimb } from '@common-enums/limbs.enum';
import { EPoseSide } from '@common-enums/pose-side.enum';
import { EPoseType } from '@common-enums/pose-type.enum';

export interface IFilterExercises {
  name?: string;
  limbs?: ELimb[];
  pose_type?: EPoseType;
  pose_side?: EPoseSide;
  exercise_type?: EExerciseType;
}
