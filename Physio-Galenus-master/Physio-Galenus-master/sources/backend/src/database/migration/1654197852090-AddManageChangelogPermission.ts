import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManageChangelogPermission1654197852090
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`INSERT INTO permission (id, name, description, "permissionCategoryId", "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action") 
      VALUES ('MANAGE_CHANGELOG', 'Manage the changelog', 'Allows a user to manage the changelog', 'ADMIN', false, false, true, false, true)`);

    await queryRunner.query(`INSERT INTO role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
      VALUES ('ADMIN', 'MANAGE_CHANGELOG', false, false, true, false, true)`);

    await queryRunner.query(`INSERT INTO role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
      VALUES ('THERAPIST', 'MANAGE_CHANGELOG', false, false, true, false, true)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
