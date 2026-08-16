import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSectionApiKeysPermission1659046222668
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO permission (id, name, description, "permissionCategoryId", "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action") 
          VALUES ('SECTION_POLICIES_API_KEYS', 'Access to the section Api Keys', 'Allows a user to access to the section Api Keys', 'SECTIONS', false, false, true, false, false)`);

    await queryRunner.query(`INSERT INTO role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
          VALUES ('ADMIN', 'SECTION_POLICIES_API_KEYS', true, true, true, true, true)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
