import { MigrationInterface, QueryRunner } from 'typeorm';
import { User } from '../entity/user.entity';
import { PricingPlan } from '../entity';
import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';

const DEMO_USER_EMAIL = 'demo@demo.com';
const DEMO_USER_PASSWORD = '202601SoftwareXDemoUser!';
const TEST_USER_EMAIL = 'test@test.com';
const DEMO_ROLE_ID = 'DEMO_THERAPIST';

const SECTION_PERMISSIONS_READ_ONLY = [
  'SECTION_PATIENTS_MY_PATIENTS',
  'SECTION_PATIENTS_PATIENT_PROFILE',
  'SECTION_EXERCISES_DETAILS',
  'SECTION_ROUTINES_DETAILS',
  'SECTION_ROUTINES_ADJUST_DIFFICULTY',
  'SECTION_ROUTINES_MY_ROUTINES',
  'SECTION_USER_MY_PROFILE',
  'SECTION_USER_NOTIFICATIONS',
];

const MANAGEMENT_PERMISSIONS_READ_LIST = [
  { id: 'MANAGE_PATIENTS', can_read: true, can_list: true },
  { id: 'MANAGE_ROUTINES', can_read: true, can_list: true },
  { id: 'MANAGE_EXERCISES', can_read: true, can_list: true },
  { id: 'MANAGE_USER_NOTIFICATION', can_read: true, can_list: true },
];

const STATISTICS_PERMISSIONS_READ = [
  { id: 'MANAGE_SUMMARIZED_STATISTICS', can_read: true },
];

export class AddDemoUserFeature1771747138518 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const { manager } = queryRunner;

    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_demo" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "demo_data_source_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP CONSTRAINT IF EXISTS "FK_f8511d4ff6fe005822fc4a45652"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD CONSTRAINT "FK_f8511d4ff6fe005822fc4a45652" FOREIGN KEY ("demo_data_source_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;`,
    );

    await queryRunner.query(
      `INSERT INTO "public".role (id, name, description, deletable, read_only, is_hidden)
       VALUES ('${DEMO_ROLE_ID}', 'Demo Therapist', 'Read-only role for demo users', false, true, true)`,
    );

    for (const permId of SECTION_PERMISSIONS_READ_ONLY) {
      await queryRunner.query(
        `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
         VALUES ('${DEMO_ROLE_ID}', '${permId}', false, false, true, false, false)`,
      );
    }

    for (const perm of MANAGEMENT_PERMISSIONS_READ_LIST) {
      await queryRunner.query(
        `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
         VALUES ('${DEMO_ROLE_ID}', '${perm.id}', false, false, ${perm.can_read}, false, ${perm.can_list})`,
      );
    }

    for (const perm of STATISTICS_PERMISSIONS_READ) {
      await queryRunner.query(
        `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
         VALUES ('${DEMO_ROLE_ID}', '${perm.id}', false, false, ${perm.can_read}, false, false)`,
      );
    }

    const testUser = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.username = :username', { username: TEST_USER_EMAIL })
      .getOne();

    if (!testUser) {
      console.warn(
        `Warning: ${TEST_USER_EMAIL} not found. Demo user will be created without data source link.`,
      );
    }

    const pricingPlan = await manager
      .getRepository(PricingPlan)
      .createQueryBuilder('pricingPlan')
      .where('pricingPlan.type = :pricingType', {
        pricingType: EPricingPlanType.Professional,
      })
      .getOne();

    const savedDemoUser = await manager.getRepository(User).save(
      manager.create(User, {
        username: DEMO_USER_EMAIL,
        password: DEMO_USER_PASSWORD,
        pricing_plan: pricingPlan,
        is_activated: true,
        is_demo: true,
        demo_data_source: testUser || undefined,
      }),
    );

    await queryRunner.query(
      `INSERT INTO "public".user_roles_role ("userId", "roleId")
       VALUES ('${savedDemoUser.id}', '${DEMO_ROLE_ID}')`,
    );

    await queryRunner.query(
      `ALTER TABLE "api_key" ALTER COLUMN "num_issued_requests" SET DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const { manager } = queryRunner;

    await queryRunner.query(
      `ALTER TABLE "api_key" ALTER COLUMN "num_issued_requests" SET DEFAULT '0'`,
    );

    await queryRunner.query(
      `DELETE FROM "public".user_roles_role WHERE "roleId" = '${DEMO_ROLE_ID}'`,
    );

    const demoUser = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.username = :username', { username: DEMO_USER_EMAIL })
      .getOne();
    if (demoUser) {
      await manager.getRepository(User).remove(demoUser);
    }

    await queryRunner.query(
      `DELETE FROM "public".role_to_permission WHERE "role_id" = '${DEMO_ROLE_ID}'`,
    );

    await queryRunner.query(
      `DELETE FROM "public".role WHERE id = '${DEMO_ROLE_ID}'`,
    );

    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "demo_data_source_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN IF EXISTS "is_demo"`,
    );
  }
}
