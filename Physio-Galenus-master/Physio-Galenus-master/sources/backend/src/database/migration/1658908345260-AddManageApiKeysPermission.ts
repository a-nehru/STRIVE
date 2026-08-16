import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManageApiKeysPermission1658908345260
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "public".permission (id, name, description, "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action", "permissionCategoryId")
                 VALUES ('MANAGE_API_KEYS', 'Manage API keys', 'This permission allows to manage the API keys to issue requests to the application', true, true, true, true, true, 'SYSTEM')`,
    );

    await queryRunner.query(
      `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
                 VALUES ('ADMIN', 'MANAGE_API_KEYS', true, true, true, true, true)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "public".role_to_permission WHERE "permission_id"='MANAGE_API_KEYS'`,
    );
    await queryRunner.query(
      `DELETE FROM "public".permission WHERE id='MANAGE_API_KEYS'`,
    );
  }
}
