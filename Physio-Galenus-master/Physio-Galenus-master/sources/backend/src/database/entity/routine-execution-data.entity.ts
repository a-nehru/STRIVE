import { IWaypointTimestamp } from '@common-types/exercise.interface';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Exercise } from './exercise.entity';
import { Patient } from './patient.entity';
import { Routine } from './routine.entity';

@Entity()
@Unique(['patient', 'routine', 'exercise', 'current_set', 'create_date'])
export class RoutineExecutionData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  create_date: Date;

  @ManyToOne('Patient', 'routine_execution_data', {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  patient: Patient;

  @ManyToOne('Routine', 'routine_execution_data', {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  routine: Routine;

  @ManyToOne('Exercise', 'routine_execution_data', {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  exercise: Exercise;

  @Column('int', { default: 0 })
  current_set: number;

  @Column('int', { default: 0 })
  completion_time: number;

  @Column('int', { default: 0 })
  completion: number;

  @Column('int', { default: 0 })
  reps: number;

  @Column('int', { default: 0 })
  compensation: number;

  @Column('int', { default: 0 })
  fatigue: number;

  @Column('jsonb', { default: [] })
  waypoint_timestamps: IWaypointTimestamp[];
}
