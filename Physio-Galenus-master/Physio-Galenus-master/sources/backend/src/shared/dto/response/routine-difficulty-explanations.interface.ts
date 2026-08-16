import {
  IExerciseExplanations,
  IExplanation,
  INewExerciseAdequacy,
  INewExerciseConfiguration,
} from '@common-interfaces/explanation.interface';

export interface IRoutineDifficultyExplanations {
  readonly original_routine_id?: string;
  readonly exergame_number_explanation: IExplanation;
  readonly exergame_explanations: IExerciseExplanations[];
  readonly new_performance: number;
  readonly new_exercise_adequacies: INewExerciseAdequacy[];
  readonly new_exercise_configurations: INewExerciseConfiguration[];
}
