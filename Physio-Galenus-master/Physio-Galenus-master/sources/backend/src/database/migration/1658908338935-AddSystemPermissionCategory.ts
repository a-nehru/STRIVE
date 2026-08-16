import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSystemPermissionCategory1658908338935
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "public".permission_category (id, name, description) VALUES ('SYSTEM', 'System', 'Category to store all the system permissions')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "public".permission_category WHERE id='SYSTEM'`,
    );
  }
}
