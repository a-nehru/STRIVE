import {
  EExplanationFuzzyCategory,
  EExplanationVariable,
} from '@common-enums/explanation-variable.enum';
import { IExercise } from '@common-types/exercise.interface';

export interface IExplanationClause {
  variable: EExplanationVariable;
  value: number;
  fuzzy_category: EExplanationFuzzyCategory;
}

export interface IExplanation {
  antecedents: IExplanationClause[];
  consequent: IExplanationClause;
}

export type ICompactedExplanation = Omit<IExplanation, 'consequent'> & {
  consequents: IExplanationClause[];
};

export interface IExerciseExplanations {
  exerciseId: string;
  cluster: number;
  explanations: IExplanation[];
}

export interface INewExerciseAdequacy {
  exerciseId: string;
  adequacy: number;
}

export interface INewExerciseConfiguration {
  exerciseId: string;
  exercise?: Partial<IExercise>;
  reps: number;
  sets: number;
  rest_between_sets: number;
  time: number;
}
