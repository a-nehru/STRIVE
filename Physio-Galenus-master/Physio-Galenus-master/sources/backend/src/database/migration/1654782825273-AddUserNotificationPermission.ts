import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserNotificationPermission1654782825273
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO permission_category (id, name, description) VALUES ('NOTIFICATIONS', 'notifications', 'Category to store all the notifications permissions')`,
    );
    await queryRunner.query(`INSERT INTO permission (id, name, description, "permissionCategoryId", "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action") 
      VALUES ('MANAGE_USER_NOTIFICATION', 'Manage the user notifications', 'Allows a user to manage notifications', 'NOTIFICATIONS', true, true, true, true, true)`);

    await queryRunner.query(`INSERT INTO permission (id, name, description, "permissionCategoryId", "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action") 
      VALUES ('SECTION_USER_NOTIFICATIONS', 'Access to the section User Notifications', 'Allows a user to access to the section User Notifications', 'SECTIONS', false, false, true, false, false)`);

    await queryRunner.query(`INSERT INTO role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
      VALUES ('ADMIN', 'MANAGE_USER_NOTIFICATION', true, true, true, true, true)`);

    await queryRunner.query(`INSERT INTO role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
      VALUES ('ADMIN', 'SECTION_USER_NOTIFICATIONS', false, false, true, false, false)`);

    await queryRunner.query(`INSERT INTO role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
      VALUES ('THERAPIST', 'MANAGE_USER_NOTIFICATION', true, true, true, true, true)`);

    await queryRunner.query(`INSERT INTO role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
      VALUES ('THERAPIST', 'SECTION_USER_NOTIFICATIONS', false, false, true, false, false)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
