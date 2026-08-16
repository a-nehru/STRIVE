import {
  Exercise,
  Patient,
  Routine,
  RoutineExecutionData,
  RoutineToExercise,
  User,
} from 'src/database/entity';
import { EDaysOfWeek } from '@common-enums/days-of-week.enum';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { envConfig } from '@config/environment.config';

export class SeedSampleRoutines1637926816183 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const { manager } = queryRunner;

    const therapists = await manager.getRepository(User).find();
    const exercises = await manager.getRepository(Exercise).find();

    for (const therapist of therapists) {
      for (let i = 0; i < 10; i++) {
        try {
          const routine = await manager.getRepository(Routine).save(
            manager.create(Routine, {
              name: `Routine ${i}`,
              therapist: therapist,
              start_date: '2021-01-01',
              end_date: '2022-10-01',
              repetition_weekdays: Object.values(EDaysOfWeek),
            }),
          );

          for (const exercise of exercises) {
            await manager.getRepository(RoutineToExercise).save(
              manager.create(RoutineToExercise, {
                exercise,
                routine,
                time: 120,
                rest_between_sets: 120,
                sets: 2,
                reps: 4,
              }),
            );
          }
        } catch {
          // Do nothing
        }
      }
    }

    const randomRoutine = await manager.getRepository(Routine).findOne();
    const patient = await manager
      .getRepository(Patient)
      .createQueryBuilder('patient')
      .where('patient.access_token = :accessToken', {
        accessToken: envConfig.seed.demoAccessToken,
      })
      .getOne();
    patient.routine = randomRoutine;
    await manager.getRepository(Patient).save(patient);

    await manager.getRepository(RoutineExecutionData).save(
      manager.create(RoutineExecutionData, {
        patient: manager.create(Patient, { id: patient.id }),
        routine: manager.create(Routine, { id: randomRoutine.id }),
        exercise: exercises[0],
        current_set: 1,
        completion_time: 300,
        waypoint_timestamps: [],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const { manager } = queryRunner;

    const routines = await manager
      .getRepository(Routine)
      .createQueryBuilder('routine')
      .where("routine.name ~ 'Routine \\d+'")
      .getMany();
    if (routines) {
      await manager.getRepository(Routine).remove(routines);
    }
  }
}
