import { EDaysOfWeek } from '@common-enums/days-of-week.enum';
import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '.';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';
import { Patient } from './patient.entity';
import { RoutineExecutionData } from './routine-execution-data.entity';
import { RoutineToExercise } from './routine-to-exercise.entity';
import { RoutineAdjustedDifficulty } from './routine_adjusted_difficulty.entity';

@Entity()
export class Routine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  name: string;

  @ManyToOne('User', 'routines', {
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
  })
  therapist: User;

  @OneToMany('Patient', 'routine', {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  patients: Patient[];

  @Column('date')
  start_date: string;

  @Column('date')
  end_date: string;

  @Column('enum', { enum: EDaysOfWeek, array: true })
  repetition_weekdays: EDaysOfWeek[];

  @OneToMany('RoutineToExercise', 'routine', {
    onDelete: 'NO ACTION',
  })
  routine_to_exercise: RoutineToExercise[];

  @OneToMany('RoutineExecutionData', 'routine', {
    onDelete: 'NO ACTION',
  })
  routine_execution_data: RoutineExecutionData[];

  @Column('boolean', { default: false })
  is_adjusting_difficulty: boolean;

  @OneToOne('RoutineAdjustedDifficulty', 'original_routine', {
    onDelete: 'NO ACTION',
  })
  routine_adjusted_difficulty: RoutineAdjustedDifficulty;

  @Column(() => EmbeddedAuditDates, { prefix: false })
  audit_dates?: EmbeddedAuditDates = new EmbeddedAuditDates();
}
