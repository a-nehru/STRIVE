import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { PricingPlan } from '../entity';

export class SeedPricingPlans1628092679308 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const { manager } = queryRunner;

    const pricingPlans = [
      manager.create(PricingPlan, {
        type: EPricingPlanType.Basic,
        number_of_supervised_patients: 1,
        rehabilitation_time_mins_day: 30,
        personalised_rehabilitation_routines_per_client: 1,
        exergames: 1,
        technical_support: true,
        reports_and_metrics: false,
        remote_asistance: false,
        automatic_exercise_difficulty_adaptation: false,
        videos_recorded_by_the_therapist: false,
        mobile_app_for_patients: false,
        customized_exergames: false,
        customized_exercises: false,
        automatic_routine_recommendation: false,
        mobile_app_for_therapists: false,
        personalised_alerts_and_notifications: false,
        mobile_tracking_support: false,
        hand_rehabilitation: false,
        number_of_trial_days: 30,
        price: 9.99,
      }),
      manager.create(PricingPlan, {
        type: EPricingPlanType.Advanced,
        number_of_supervised_patients: 10,
        rehabilitation_time_mins_day: 90,
        personalised_rehabilitation_routines_per_client: 3,
        exergames: 5,
        technical_support: true,
        reports_and_metrics: true,
        remote_asistance: false,
        automatic_exercise_difficulty_adaptation: true,
        videos_recorded_by_the_therapist: true,
        mobile_app_for_patients: true,
        customized_exergames: false,
        customized_exercises: false,
        automatic_routine_recommendation: false,
        mobile_app_for_therapists: false,
        personalised_alerts_and_notifications: false,
        mobile_tracking_support: false,
        hand_rehabilitation: false,
        number_of_trial_days: 30,
        price: 19.99,
      }),
      manager.create(PricingPlan, {
        type: EPricingPlanType.Professional,
        number_of_supervised_patients: 25,
        rehabilitation_time_mins_day: -1, // negative numbers means unlimited
        personalised_rehabilitation_routines_per_client: 10,
        exergames: -1,
        technical_support: true,
        reports_and_metrics: true,
        remote_asistance: true,
        automatic_exercise_difficulty_adaptation: true,
        videos_recorded_by_the_therapist: true,
        mobile_app_for_patients: true,
        customized_exergames: true,
        customized_exercises: true,
        automatic_routine_recommendation: true,
        mobile_app_for_therapists: true,
        personalised_alerts_and_notifications: true,
        mobile_tracking_support: true,
        hand_rehabilitation: true,
        number_of_trial_days: 30,
        price: 29.99,
      }),
    ];

    await manager.getRepository(PricingPlan).save(pricingPlans);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "public".pricing_plan WHERE "type" = $1`,
      [EPricingPlanType.Basic],
    );
    await queryRunner.query(
      `DELETE FROM "public".pricing_plan WHERE "type" = $1`,
      [EPricingPlanType.Advanced],
    );
    await queryRunner.query(
      `DELETE FROM "public".pricing_plan WHERE "type" = $1`,
      [EPricingPlanType.Professional],
    );
  }
}
