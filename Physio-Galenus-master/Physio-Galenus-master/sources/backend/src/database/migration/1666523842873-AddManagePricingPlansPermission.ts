import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManagePricingPlansPermission1666523842873
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "public".permission (id, name, description, "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action", "permissionCategoryId")
        VALUES ('MANAGE_PRICING_PLANS', 'Manage Pricing Plans', 'This permission allows to manage the Pricing plans of the application', true, true, true, true, true, 'MANAGE_ENTITIES')`,
    );

    await queryRunner.query(
      `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
        VALUES ('ADMIN', 'MANAGE_PRICING_PLANS', true, true, true, true, true)`,
    );

    await queryRunner.query(
      `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
        VALUES ('THERAPIST', 'MANAGE_PRICING_PLANS', false, true, true, false, true)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "public".role_to_permission WHERE "permission_id"='MANAGE_PRICING_PLANS'`,
    );
    await queryRunner.query(
      `DELETE FROM "public".permission WHERE id='MANAGE_PRICING_PLANS'`,
    );
  }
}
