import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';

@Entity()
export class PricingPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('enum', {
    enum: EPricingPlanType,
    default: EPricingPlanType.Personal,
  })
  type: EPricingPlanType;

  @Column('int', { default: 0 })
  number_of_supervised_patients: number;

  @Column('int', { default: 0 })
  rehabilitation_time_mins_day: number;

  @Column('int', { default: 0 })
  personalised_rehabilitation_routines_per_client: number;

  @Column('int', { default: 0 })
  exergames: number;

  // TO DO: gamification_mechanisms;

  @Column('bool', { default: false })
  technical_support: boolean;

  @Column('bool', { default: false })
  reports_and_metrics: boolean;

  @Column('bool', { default: false })
  remote_asistance: boolean;

  @Column('bool', { default: false })
  automatic_exercise_difficulty_adaptation: boolean;

  @Column('bool', { default: false })
  videos_recorded_by_the_therapist: boolean;

  @Column('bool', { default: false })
  mobile_app_for_patients: boolean;

  @Column('bool', { default: false })
  customized_exergames: boolean;

  @Column('bool', { default: false })
  customized_exercises: boolean;

  @Column('bool', { default: false })
  automatic_routine_recommendation: boolean;

  @Column('bool', { default: false })
  mobile_app_for_therapists: boolean;

  @Column('bool', { default: false })
  personalised_alerts_and_notifications: boolean;

  @Column('bool', { default: false })
  mobile_tracking_support: boolean;

  @Column('bool', { default: false })
  hand_rehabilitation: boolean;

  @Column('int', { default: 0 })
  number_of_trial_days: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, default: 10000000.0 })
  price: number;
}
