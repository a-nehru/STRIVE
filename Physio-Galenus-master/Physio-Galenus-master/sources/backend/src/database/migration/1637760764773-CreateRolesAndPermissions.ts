import { EPermission } from 'src/common/permissions';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRolesAndPermissions1637760764773
  implements MigrationInterface
{
  SECTION_PERMISSIONS = [
    { id: EPermission.SectionPatientsMyPatients, text: 'PATIENTS My Patients' },
    { id: EPermission.SectionPatientsAddPatient, text: 'PATIENTS Add Patient' },
    {
      id: EPermission.SectionPatientsPatientProfile,
      text: 'PATIENTS Patient Profile',
    },
    { id: EPermission.SectionExercisesDetails, text: 'EXERCISES Details' },
    { id: EPermission.SectionRoutinesAddRoutine, text: 'ROUTINES Add Routine' },
    { id: EPermission.SectionRoutinesDetails, text: 'ROUTINES Details' },
    {
      id: EPermission.SectionRoutinesAdjustDifficulty,
      text: 'ROUTINE Adjust Difficulty',
    },
    { id: EPermission.SectionRoutinesMyRoutines, text: 'ROUTINES My Routines' },
    { id: EPermission.SectionUserMyProfile, text: 'USER My Profile' },
  ];
  MANAGEMENT_PERMISSIONS = [
    {
      id: 'MANAGE_EXERCISES',
      text: 'Manage Exercises',
      has_create_action: false,
      has_edit_action: false,
      has_read_action: true,
      has_delete_action: false,
      has_list_action: true,
    },
    {
      id: 'MANAGE_PATIENTS',
      text: 'Manage Patients',
      has_create_action: true,
      has_edit_action: true,
      has_read_action: true,
      has_delete_action: true,
      has_list_action: true,
    },
    {
      id: 'MANAGE_ROUTINES',
      text: 'Manage Routines',
      has_create_action: true,
      has_edit_action: true,
      has_read_action: true,
      has_delete_action: true,
      has_list_action: true,
    },
    {
      id: 'MANAGE_USERS',
      text: 'Manage Users',
      has_create_action: true,
      has_edit_action: true,
      has_read_action: true,
      has_delete_action: true,
      has_list_action: true,
      only_admin: true,
    },
  ];
  STATISTICS_PERMISSIONS = [
    {
      id: 'MANAGE_SUMMARIZED_STATISTICS',
      text: 'Manage summarized statistics',
      has_create_action: false,
      has_edit_action: false,
      has_read_action: true,
      has_delete_action: false,
      has_list_action: false,
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ROLES
    await queryRunner.query(
      `INSERT INTO "public".role (id, name, description, deletable, read_only, is_hidden) VALUES ('ADMIN', 'Administrator', 'Allows to CRUD resources related to the whole application',false,false,true)`,
    );
    await queryRunner.query(
      `INSERT INTO "public".role (id, name, description, deletable, read_only, is_hidden) VALUES ('THERAPIST', 'Therapist', 'Role for therapists',false,false,false)`,
    );

    //PERMISSION CATEGORY

    await queryRunner.query(
      `INSERT INTO "public".permission_category (id, name, description) VALUES ('SECTIONS', 'Sections', 'Category to store all the sections permissions')`,
    );
    await queryRunner.query(
      `INSERT INTO "public".permission_category (id, name, description) VALUES ('MANAGE_ENTITIES', 'Entities Management', 'Category to store all the entity management permissions')`,
    );
    await queryRunner.query(
      `INSERT INTO "public".permission_category (id, name, description) VALUES ('MANAGE_STATISTICS', 'Statistics Management', 'Category to store all the statistics management permissions')`,
    );

    //PERMISSIONS
    this.SECTION_PERMISSIONS.forEach(async (sp) => {
      await queryRunner.query(
        `INSERT INTO "public".permission (id, name, description, "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action", "permissionCategoryId")
                VALUES ('${sp.id}', 'Access to the section ${sp.text}', 'Allows a user to access to the section ${sp.text}', false,false,true,false,false,'SECTIONS')`,
      );
    });

    this.MANAGEMENT_PERMISSIONS.forEach(async (sp) => {
      await queryRunner.query(
        `INSERT INTO "public".permission (id, name, description, "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action", "permissionCategoryId")
                VALUES ('${sp.id}', '${sp.text}', 'Allows a user to ${sp.text}', ${sp.has_create_action}, ${sp.has_edit_action}, ${sp.has_read_action}, ${sp.has_delete_action}, ${sp.has_list_action},'MANAGE_ENTITIES')`,
      );
    });
    this.STATISTICS_PERMISSIONS.forEach(async (sp) => {
      await queryRunner.query(
        `INSERT INTO "public".permission (id, name, description, "has_create_action", "has_edit_action", "has_read_action", "has_delete_action", "has_list_action", "permissionCategoryId")
                    VALUES ('${sp.id}', '${sp.text}', 'Allows a user to ${sp.text}', ${sp.has_create_action}, ${sp.has_edit_action}, ${sp.has_read_action}, ${sp.has_delete_action}, ${sp.has_list_action},'MANAGE_STATISTICS')`,
      );
    });

    //ROLE TO PERMISSION

    this.SECTION_PERMISSIONS.forEach(async (sp) => {
      await queryRunner.query(
        `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
                VALUES ('ADMIN', '${sp.id}', false,false,true,false,false)`,
      );
      await queryRunner.query(
        `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
                VALUES ('THERAPIST', '${sp.id}', false,false,true,false,false)`,
      );
    });

    this.MANAGEMENT_PERMISSIONS.forEach(async (sp) => {
      await queryRunner.query(
        `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
                VALUES ('ADMIN', '${sp.id}', ${sp.has_create_action}, ${sp.has_edit_action}, ${sp.has_read_action}, ${sp.has_delete_action}, ${sp.has_list_action})`,
      );

      !sp.only_admin &&
        (await queryRunner.query(
          `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
                VALUES ('THERAPIST', '${sp.id}', ${sp.has_create_action}, ${sp.has_edit_action}, ${sp.has_read_action}, ${sp.has_delete_action}, ${sp.has_list_action})`,
        ));
    });
    this.STATISTICS_PERMISSIONS.forEach(async (sp) => {
      await queryRunner.query(
        `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
                    VALUES ('ADMIN', '${sp.id}', false,false,true,false,false)`,
      );
      await queryRunner.query(
        `INSERT INTO "public".role_to_permission ("role_id", "permission_id", "can_create", "can_edit", "can_read", "can_delete", "can_list")
                    VALUES ('THERAPIST', '${sp.id}', false,false,true,false,false)`,
      );
    });
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ROLE TO PERMISSION
    this.MANAGEMENT_PERMISSIONS.forEach(
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
    this.STATISTICS_PERMISSIONS.forEach(
      async (sp) =>
        await queryRunner.query(
          `DELETE FROM "public".role_to_permission WHERE "permission_id"='${sp.id}'`,
        ),
    );

    //PERMISSION

    this.MANAGEMENT_PERMISSIONS.forEach(
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
    this.STATISTICS_PERMISSIONS.forEach(
      async (sp) =>
        await queryRunner.query(
          `DELETE FROM "public".permission WHERE id='${sp.id}'`,
        ),
    );

    //PERMISSION CATEGORY
    await queryRunner.query(
      `DELETE FROM "public".permission_category WHERE id='MANAGE_ENTITIES'`,
    );
    await queryRunner.query(
      `DELETE FROM "public".permission_category WHERE id='SECTIONS'`,
    );
    await queryRunner.query(
      `DELETE FROM "public".permission_category WHERE id='MANAGE_STATISTICS'`,
    );

    //USER ROLES if any exists
    await queryRunner.query(
      `DELETE FROM "public".user_roles_role WHERE "roleId"='ADMIN'`,
    );
    await queryRunner.query(
      `DELETE FROM "public".user_roles_role WHERE "roleId"='THERAPIST'`,
    );

    //ROLE
    await queryRunner.query(`DELETE FROM "public".role WHERE id='THERAPIST'`);
    await queryRunner.query(`DELETE FROM "public".role WHERE id='ADMIN'`);
  }
}
