import { MigrationInterface, QueryRunner } from 'typeorm';
import { Patient } from '../entity/patient.entity';
import { User } from '../entity/user.entity';
import { EGender } from '@common-enums/gender.enum';
import { PatientDifficultyData, PricingPlan } from '../entity';
import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { generateToken } from 'src/misc/generate-token';
import {
  pseudoBirthDate,
  pseudoEmail,
  pseudoFirstName,
  pseudoLastName,
} from '@common-utils/anonymization-utils';
import { envConfig } from '@config/environment.config';
import { EStrokeSide } from '@common-enums/stroke-side.enum';

const DEMO_EMAIL = 'test@test.com';
const DEMO_PASSWORD = envConfig.seed.demoPassword;
const DEMO_ACCESS_TOKEN = envConfig.seed.demoAccessToken;
const DEMO_PRICING_PLAN = EPricingPlanType.Professional;
const PREFIXES = ['', '1_', '2_', '3_', '4_', '5_', '6_', '7_', '8_', '9_'];

export class SeedDemoUserAndPatient1628092694010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const { manager } = queryRunner;

    const pricingPlan = await manager
      .getRepository(PricingPlan)
      .createQueryBuilder('pricingPlan')
      .where('pricingPlan.type = :pricingType', {
        pricingType: DEMO_PRICING_PLAN,
      })
      .getOne();
    for (const prefix of PREFIXES) {
      const savedUser = await manager.getRepository(User).save(
        manager.create(User, {
          username: prefix + DEMO_EMAIL,
          password: DEMO_PASSWORD,
          pricing_plan: pricingPlan,
          is_activated: true,
        }),
      );

      await manager.getRepository(Patient).save(
        manager.create(Patient, {
          nickname: prefix + DEMO_EMAIL,
          email: prefix + DEMO_EMAIL,
          access_token: prefix + DEMO_ACCESS_TOKEN,
          user: savedUser,
          birth_date: new Date(1990, 0),
          gender: EGender.Female,
          stroke_side: EStrokeSide.Bilateral,
        }),
      );

      const year: number = new Date().getUTCFullYear();
      const month: number = new Date().getUTCMonth();

      const lastMonthDate: Date = new Date();
      lastMonthDate.setDate(0);

      const lastMonth: number = lastMonthDate.getUTCMonth();

      for (let i = 0; i < 22; i++) {
        try {
          const newPatient = await manager.getRepository(Patient).save(
            manager.create(Patient, {
              nickname: prefix + pseudoFirstName() + ' ' + pseudoLastName(),
              email: prefix + pseudoEmail(),
              access_token: generateToken(envConfig.patientTokenLength),
              therapist: savedUser,
              birth_date: pseudoBirthDate(16, 50),
              gender: Math.random() < 0.5 ? EGender.Female : EGender.Male,
              stroke_side: EStrokeSide.Bilateral,
              audit_dates: {
                updated_at: new Date(),
                created_at: new Date(
                  Math.random() < 0.5 ? year : year - 1,
                  Math.random() < 0.5 ? month : lastMonth,
                  15,
                ),
              },
            }),
          );
          await manager.getRepository(PatientDifficultyData).save(
            manager.create(PatientDifficultyData, {
              mobility: 50,
              performance: 50,
              patient: newPatient,
            }),
          );
        } catch {
          // Do nothing
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const { manager } = queryRunner;

    for (const prefix of PREFIXES) {
      const patients = await manager
        .getRepository(Patient)
        .createQueryBuilder('patient')
        .leftJoin('patient.therapist', 'therapist')
        .leftJoin('patient.user', 'user')
        .where('user.username = :usernameToDelete', {
          usernameToDelete: prefix + DEMO_EMAIL,
        })
        .orWhere('therapist.username = :usernameToDelete', {
          usernameToDelete: prefix + DEMO_EMAIL,
        })
        .getMany();

      if (patients) {
        await manager.getRepository(Patient).remove(patients);
      }

      const user = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .where('user.username = :usernameToDelete', {
          usernameToDelete: prefix + DEMO_EMAIL,
        })
        .getOne();

      if (user) {
        await manager.getRepository(User).remove(user);
      }
    }
  }
}
