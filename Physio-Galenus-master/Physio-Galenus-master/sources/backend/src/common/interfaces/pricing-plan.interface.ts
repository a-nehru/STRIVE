import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';

export interface IPricingPlan {
  type: EPricingPlanType;
  number_of_supervised_patients: number;
  rehabilitation_time_mins_day: number;
  personalised_rehabilitation_routines_per_client: number;
  exergames: number;
  technical_support: boolean;
  reports_and_metrics: boolean;
  remote_asistance: boolean;
  automatic_exercise_difficulty_adaptation: boolean;
  videos_recorded_by_the_therapist: boolean;
  mobile_app_for_patients: boolean;
  customized_exergames: boolean;
  customized_exercises: boolean;
  automatic_routine_recommendation: boolean;
  mobile_app_for_therapists: boolean;
  personalised_alerts_and_notifications: boolean;
  mobile_tracking_support: boolean;
  hand_rehabilitation: boolean;
  number_of_trial_days: number;
  price: number;
}
