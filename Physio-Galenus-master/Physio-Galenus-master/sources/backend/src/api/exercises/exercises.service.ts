import { FullPatientDto } from '@common-response-dto/full-patient.dto';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Exercise } from 'src/database/entity';
import { Connection, EntityManager, SelectQueryBuilder } from 'typeorm';
import { AppError } from '../errors/app-error.exception';

@Injectable()
export class ExercisesService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  private getRoutineQuery(em?: EntityManager): SelectQueryBuilder<Exercise> {
    const manager = em ? em : this.connection.manager;
    return manager.getRepository(Exercise).createQueryBuilder('exercise');
  }

  async getExercise(id: string): Promise<Exercise> {
    const exercise = await this.getRoutineQuery()
      .where('exercise.id = :id', { id })
      .getOne();
    if (!exercise) {
      throw new AppError({
        message: `No exercise data was found for ID ${id}`,
      });
    }

    return exercise;
  }

  async getAutonomousExercises(patient: FullPatientDto): Promise<Exercise[]> {
    const exercises = await this.getRoutineQuery()
      .where('exercise.autonomous_config IS NOT NULL')
      .getMany();

    if (!exercises) {
      throw new AppError({
        message: `No autonomous exercise data was found`,
      });
    }

    return exercises;
  }
}
