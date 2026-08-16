import { EGender } from '@common-enums/gender.enum';
import { EStrokeSide } from '@common-enums/stroke-side.enum';
import {
  Column,
  Entity,
  Generated,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RelationIdColumn } from '../base/relation-id-column.decorator';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';
import { PatientDifficultyData } from './patient-difficulty-data.entity';
import { RoutineExecutionData } from './routine-execution-data.entity';
import { Routine } from './routine.entity';
import { User } from './user.entity';
import { IPatientSettings } from '@common-types/patient-settings.interface';

export interface IPatient {
  id: string;
  public_id: number;
  email?: string;
  therapist: User;
  birth_date?: Date;
  gender: EGender;
  stroke_side: EStrokeSide;
  prefer_to_self_describe_text?: string;
  user: User;
  userId?: string;
  access_token: string;
  routine?: Routine;
  routine_execution_data?: RoutineExecutionData[];
  difficulty_data?: PatientDifficultyData;
  settings?: IPatientSettings;
  audit_dates?: EmbeddedAuditDates;
}
@Entity()
export class Patient implements IPatient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Generated()
  public_id: number;

  @Column('text', { nullable: false, unique: true })
  nickname: string;

  @Column('text', { nullable: true, unique: true })
  email?: string;

  @ManyToOne('User', 'patients', {
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  therapist: User;

  @Column('date', { nullable: true })
  birth_date?: Date;

  @Column('enum', { enum: EGender, default: EGender.SomethingElse })
  gender: EGender;

  @Column('enum', { enum: EStrokeSide })
  stroke_side: EStrokeSide;

  @Column('text', { nullable: true })
  prefer_to_self_describe_text?: string;

  @OneToOne('User', 'demo_patient', {
    nullable: true,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  @JoinColumn()
  user: User;

  @RelationIdColumn()
  userId?: string;

  @Column('text', { nullable: false, unique: true })
  access_token: string;

  @ManyToOne('Routine', 'patients', {
    nullable: true,
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE',
  })
  routine?: Routine;

  @OneToMany('RoutineExecutionData', 'patient', {
    nullable: true,
    onDelete: 'NO ACTION',
  })
  routine_execution_data?: RoutineExecutionData[];

  @OneToOne('PatientDifficultyData', 'patient', { onDelete: 'CASCADE' })
  difficulty_data: PatientDifficultyData;

  @Column('jsonb', { nullable: true })
  settings?: IPatientSettings;

  @Column(() => EmbeddedAuditDates, { prefix: false })
  audit_dates?: EmbeddedAuditDates = new EmbeddedAuditDates();
}
