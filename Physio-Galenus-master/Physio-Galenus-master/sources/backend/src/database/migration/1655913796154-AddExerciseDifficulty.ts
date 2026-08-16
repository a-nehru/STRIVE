import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExerciseDifficulty1655913796154 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "public".exercise SET difficulty = 62 WHERE name ILIKE 'Extending the elbow%'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "public".exercise SET difficulty = 50`);
  }
}
