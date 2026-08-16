import {
  IExerciseExplanations,
  IExplanation,
  INewExerciseAdequacy,
  INewExerciseConfiguration,
} from '@common-interfaces/explanation.interface';
import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Routine } from './routine.entity';

@Entity()
export class RoutineAdjustedDifficulty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne('Routine', 'routine_adjusted_difficulty', {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn()
  original_routine: Routine;

  @Column('int', { default: 50 })
  new_performance: number;

  @Column('jsonb', { default: null })
  new_exercise_adequacies: INewExerciseAdequacy[];

  @Column('jsonb', { default: null })
  new_exercise_configurations: INewExerciseConfiguration[];

  @Column('jsonb', { default: null })
  exergame_number_explanation: IExplanation;

  @Column('jsonb', { default: null })
  exergame_explanations: IExerciseExplanations[];

  @Column('jsonb', { default: null })
  cluster_representative_exergame_ids: Record<number, string>;
}
