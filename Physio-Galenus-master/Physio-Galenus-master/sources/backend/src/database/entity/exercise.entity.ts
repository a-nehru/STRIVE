import { EExerciseType } from '@common-enums/exercise-type.enum';
import { EPoseSide } from '@common-enums/pose-side.enum';
import { EPoseType } from '@common-enums/pose-type.enum';
import {
  IExerciseAutonomousConfig,
  IExerciseMetadata,
  IExerciseWaypoint,
  IJoint,
} from '@common-types/exercise.interface';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { RoutineToExercise } from './routine-to-exercise.entity';
import { RoutineExecutionData } from './routine-execution-data.entity';
import { ExerciseAdequacy } from './exercise-adequacy.entity';
import { EStrokeSide } from '@common-enums/stroke-side.enum';

@Entity()
export class Exercise {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @Column('enum', { enum: EExerciseType })
  type: EExerciseType;

  @Column('jsonb')
  joints: IJoint[];

  @Column('enum', { enum: EPoseType })
  pose_type: EPoseType;

  @Column('enum', { enum: EPoseSide })
  pose_side: EPoseSide;

  @Column('enum', { enum: EStrokeSide })
  stroke_side: EStrokeSide;

  @Column('jsonb')
  waypoints: IExerciseWaypoint[];

  @Column('jsonb')
  metadata: IExerciseMetadata;

  @Column('jsonb')
  autonomous_config: IExerciseAutonomousConfig;

  @Column('int', { default: 50 })
  difficulty: number;

  @OneToMany('RoutineToExercise', 'exercise', {
    onDelete: 'NO ACTION',
  })
  routine_to_exercise: RoutineToExercise[];

  @OneToMany('RoutineExecutionData', 'exercise', {
    onDelete: 'NO ACTION',
  })
  routine_execution_data: RoutineExecutionData[];

  @OneToMany('ExerciseAdequacy', 'exercise', {
    onDelete: 'NO ACTION',
  })
  exercise_adequacy: ExerciseAdequacy[];
}
