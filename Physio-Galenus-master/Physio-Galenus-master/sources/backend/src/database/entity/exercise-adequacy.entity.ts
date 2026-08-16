import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Exercise } from './exercise.entity';
import { PatientDifficultyData } from './patient-difficulty-data.entity';

@Entity()
@Unique(['exercise', 'difficulty_data'])
export class ExerciseAdequacy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('PatientDifficultyData', 'exercise_adequacy', {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  difficulty_data: PatientDifficultyData;

  @ManyToOne('Exercise', 'exercise_adequacy', {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  exercise: Exercise;

  @Column('int', { default: 0 })
  adequacy: number;
}
