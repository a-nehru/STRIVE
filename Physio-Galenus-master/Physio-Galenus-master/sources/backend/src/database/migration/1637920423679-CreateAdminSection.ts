import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminSection1637920423679 implements MigrationInterface {
  SECTION_PERMISSIONS = [
    { id: 'SECTION_ADMIN', text: 'Administration' },
    { id: 'SECTION_ROLES', text: 'Roles Management' },
    { id: 'SECTION_USER_POLICIES', text: 'User Policies Management' },
  ];
  ADMIN_PERMISSIONS = [
    {
      id: 'MANAGE_ROLES',
      text: 'Manage Roles',
      has_create_action: true,
      has_edit_action: true,
      has_read_action: true,
      has_delete_action: true,
      has_list_action: true,
    },
    {
      id: 'MANAGE_PERMISSIONS',
      text: 'Manage Permissions',
      has_create_action: false,
      has_edit_action: true,
      has_read_action: true,
      has_delete_action: false,
      has_list_action: true,
    },
    {
      id: 'MANAGE_USER_ROLES',
      text: 'Change the Roles for a User',
      has_create_action: false,
      has_edit_action: true,
      has_read_action: true,
      has_delete_action: false,
      has_list_action: false,
    },
    {
      id: 'MANAGE_USER_PERMISSIONS',
      text: 'Change the Permissions for a User',
      has_create_action: false,
      has_edit_action: true,
      has_read_action: true,
      has_delete_action: true,
      has_list_action: false,
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    //PERMISSION CATEGORY
    await queryRunner.query(
      `INSERT INTO "public".permission_category (id, name, description) VALUES ('ADMIN', 'Administration', 'Category to store all the administration permissions')`,
    );

    //PERMISSIONS
    this.SECTION_PERMISSIONS.forEach(async (sp) => {
      await queryRunner.query(
        `INSERT INTO "public".permission (id, name, description, "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action", "permissionCategoryId")
                VALUES ('${sp.id}', 'Access to the section ${sp.text}', 'Allows a user to access to the section ${sp.text}', false,false,true,false,false,'SECTIONS')`,
      );
    });
    this.ADMIN_PERMISSIONS.forEach(async (sp) => {
      await queryRunner.query(
        `INSERT INTO "public".permission (id, name, description, "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action", "permissionCategoryId")
                VALUES ('${sp.id}', '${sp.text}', 'Allows a user to ${sp.text}', ${sp.has_create_action}, ${sp.has_edit_action}, ${sp.has_read_action}, ${sp.has_delete_action}, ${sp.has_list_action},'ADMIN')`,
      );
    });
    //ROLE TO PERMISSION

    this.SECTION_PERMISSIONS.forEach(async (sp) => {
      await queryRunner.query(
        `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
                VALUES ('ADMIN', '${sp.id}', false,false,true,false,false)`,
      );
    });
    this.ADMIN_PERMISSIONS.forEach(async (sp) => {
      await queryRunner.query(
        `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
                VALUES ('ADMIN', '${sp.id}', ${sp.has_create_action}, ${sp.has_edit_action}, ${sp.has_read_action}, ${sp.has_delete_action}, ${sp.has_list_action})`,
      );
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ROLE TO PERMISSION
    this.ADMIN_PERMISSIONS.forEach(
      async (sp) =>
        await queryRunner.query(
          `DELETE FROM "public".role_to_permission WHERE "permission_id"='${sp.id}'`,
        ),
    );
    this.SECTION_PERMISSIONS.forEach(
      async (sp) =>
        await queryRunner.query(
          `DELETE FROM "public".role_to_permission WHERE "permission_id"='${sp.id}'`,
        ),
    );

    //PERMISSION
    this.ADMIN_PERMISSIONS.forEach(
      async (sp) =>
        await queryRunner.query(
          `DELETE FROM "public".permission WHERE id='${sp.id}'`,
        ),
    );
    this.SECTION_PERMISSIONS.forEach(
      async (sp) =>
        await queryRunner.query(
          `DELETE FROM "public".permission WHERE id='${sp.id}'`,
        ),
    );

    //PERMISSION CATEGORY
    await queryRunner.query(
      `DELETE FROM "public".permission_category WHERE id='ADMIN'`,
    );
  }
}
