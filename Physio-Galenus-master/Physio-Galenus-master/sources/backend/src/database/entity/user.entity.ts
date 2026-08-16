import {
  AfterLoad,
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IPatient, Routine } from '.';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';
import { PricingPlan } from './pricing-plan.entity';
import { Role } from './role.entity';
import { UserToPermission } from './user-to-permission.entity';
import * as bcrypt from 'bcryptjs';
import { appConfig } from '@config/app.config';

export interface IUser {
  id: string;
  username: string;
  password: string;
  passwords_history: string;
  demo_patient: IPatient;
  patients: IPatient[];
  routines: Routine[];
  roles: Role[];
  user_to_permissions: UserToPermission[];
  pricing_plan: PricingPlan;
  last_password_updated_date: Date;
  is_password_recovery_notified: boolean;
  is_password_expiration_notified: boolean;
  is_activated: boolean;
  is_demo: boolean;
  demo_data_source: IUser;
  audit_dates?: EmbeddedAuditDates;
}

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  username: string;

  @Column('text', { nullable: true })
  password: string;

  // Passwords in lower indexes in the array = most recent
  @Column('text', { array: true })
  passwords_history: string[];

  @OneToOne('Patient', 'user', {
    eager: true,
    nullable: true,
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  })
  demo_patient: IPatient;

  @OneToMany('Patient', 'therapist', {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  patients: IPatient[];

  @OneToMany('Routine', 'therapist', {
    nullable: true,
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  routines: Routine[];

  @ManyToMany('Role', 'users')
  @JoinTable()
  roles: Role[];

  @OneToMany('UserToPermission', 'user', { eager: true })
  user_to_permissions: UserToPermission[];

  @ManyToOne('PricingPlan', {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
    nullable: true,
  })
  pricing_plan: PricingPlan;

  @Column('date', { default: () => 'CURRENT_DATE' })
  last_password_updated_date: Date;

  @Column('bool', { default: false })
  is_password_recovery_notified: boolean;

  @Column('bool', { default: false })
  is_password_expiration_notified: boolean;

  @Column('bool', { default: false })
  is_activated: boolean;

  @Column('bool', { default: false })
  is_demo: boolean;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'demo_data_source_id' })
  demo_data_source: User;

  @Column(() => EmbeddedAuditDates, { prefix: false })
  audit_dates?: EmbeddedAuditDates = new EmbeddedAuditDates();

  // Hidden column
  private tempPassword: string;

  @AfterLoad()
  private loadHashTempPassword(): void {
    this.tempPassword = this.password;
  }

  @BeforeInsert()
  @BeforeUpdate()
  private async hashPassword(): Promise<void> {
    if (this.tempPassword !== this.password) {
      const hashedPassword = await bcrypt.hash(this.password, 10);
      this.passwords_history = this.slicePasswordHistory(hashedPassword);
      this.password = hashedPassword;
    }
  }

  private slicePasswordHistory(hashedPassword: string): string[] {
    return !this.passwords_history?.length
      ? [hashedPassword]
      : [
          hashedPassword,
          ...this.passwords_history.slice(
            0,
            appConfig.auth.passwordsMaxHistory - 1,
          ),
        ];
  }
}
