import { IPatientSettings } from '@common-types/patient-settings.interface';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { Patient } from '../entity';
import { User } from '../entity/user.entity';

export class SeedPatientSettings1655385830894 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const { manager } = queryRunner;

    const users = await manager
      .createQueryBuilder(User, 'user')
      .leftJoinAndSelect('user.demo_patient', 'patient')
      .getMany();

    for (const user of users) {
      const { demo_patient: patient } = user;

      patient.settings = {
        general: {
          game: {
            numDaysToShowInstructions: 14,
            numDaysToShowSafetyGuides: 14,
          },
        },
      } as IPatientSettings;

      await manager.save(Patient, patient);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
