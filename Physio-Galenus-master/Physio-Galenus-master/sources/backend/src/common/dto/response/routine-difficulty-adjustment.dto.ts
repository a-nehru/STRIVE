import {
  IExerciseExplanations,
  IExplanation,
  INewExerciseAdequacy,
  INewExerciseConfiguration,
} from '@common-interfaces/explanation.interface';
import { IRoutineDifficultyExplanations as IRoutineDifficultyAdjustment } from '@common-response-dto-interfaces/routine-difficulty-explanations.interface';
import { Exclude, Expose, Transform } from 'class-transformer';

@Exclude()
export class RoutineDifficultyAdjustmentDto
  implements IRoutineDifficultyAdjustment
{
  @Expose({ name: 'original_routine' })
  @Transform(({ value: original_routine }) => original_routine?.id)
  readonly original_routine_id?: string;

  @Expose()
  @Transform(({ value: new_performance }) => new_performance)
  readonly new_performance: number;

  @Expose()
  @Transform(({ value: new_exercise_adequacies }) => new_exercise_adequacies)
  new_exercise_adequacies: INewExerciseAdequacy[];

  @Expose()
  @Transform(
    ({ value: new_exercise_configurations }) => new_exercise_configurations,
  )
  new_exercise_configurations: INewExerciseConfiguration[];

  @Expose()
  @Transform(
    ({ value: exergame_number_explanation }) => exergame_number_explanation,
  )
  readonly exergame_number_explanation: IExplanation;

  @Expose()
  @Transform(({ value: exergame_explanations }) => exergame_explanations)
  readonly exergame_explanations: IExerciseExplanations[];

  @Expose()
  @Transform(
    ({ value: cluster_representative_exergame_ids }) =>
      cluster_representative_exergame_ids,
  )
  readonly cluster_representative_exergame_ids: Record<number, string>;
}
