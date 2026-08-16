import { MigrationInterface, QueryRunner } from 'typeorm';

export class AssignRoleToTestUser1637937446369 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "public".user_roles_role ("userId", "roleId")
                SELECT u.id,'ADMIN'
                FROM "public".user u;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "public".user_roles_role WHERE "userId" IN (
                SELECT id FROM "public".user
            )`,
    );
  }
}
