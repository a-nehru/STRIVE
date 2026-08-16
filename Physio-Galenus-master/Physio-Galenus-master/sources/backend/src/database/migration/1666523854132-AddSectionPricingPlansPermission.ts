import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSectionPricingPlansPermission1666523854132
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO permission (id, name, description, "permissionCategoryId", "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action") 
          VALUES ('SECTION_PRICING_PLANS', 'Access to the section Pricing Plans', 'Allows a user to access to the section Pricing Plans', 'SECTIONS', false, false, true, false, false)`);

    await queryRunner.query(`INSERT INTO role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
          VALUES ('THERAPIST', 'SECTION_PRICING_PLANS', false, false, true, false, false)`);

    await queryRunner.query(`INSERT INTO role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
          VALUES ('ADMIN', 'SECTION_PRICING_PLANS', true, true, true, true, true)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
