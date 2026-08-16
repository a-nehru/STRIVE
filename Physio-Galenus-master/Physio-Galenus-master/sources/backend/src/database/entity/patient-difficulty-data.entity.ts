import {
  Column,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';
import { ExerciseAdequacy } from './exercise-adequacy.entity';
import { IPatient } from './patient.entity';

@Entity()
export class PatientDifficultyData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne('Patient', 'difficulty_data', { onDelete: 'CASCADE' })
  @JoinColumn()
  patient: IPatient;

  @Column('int', { nullable: false })
  performance: number;

  @Column('int', { nullable: false })
  mobility: number;

  @OneToMany('ExerciseAdequacy', 'difficulty_data', {
    onDelete: 'NO ACTION',
  })
  exercise_adequacy: ExerciseAdequacy[];

  @Column('date', { nullable: true })
  last_inference: string;

  @Column(() => EmbeddedAuditDates, { prefix: false })
  auditDates?: EmbeddedAuditDates = new EmbeddedAuditDates();
}
