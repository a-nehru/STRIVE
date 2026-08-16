import { MigrationInterface, QueryRunner } from 'typeorm';
import { Exercise } from '../entity';

export class ChangeExecerciseTime1642695339813 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const { manager } = queryRunner;
    const exercises = await manager.getRepository(Exercise).find();

    if (exercises && exercises.length > 0) {
      for (const exercise of exercises) {
        if (exercise) {
          exercise.autonomous_config = {
            time: 120,
            rest_between_sets: 20,
            sets: 3,
            reps: 6,
          };
        }
      }

      await manager.getRepository(Exercise).save(exercises);
    }

    await queryRunner.query(
      `UPDATE "public".routine_to_exercise SET "rest_between_sets"=20, "time"=120`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
