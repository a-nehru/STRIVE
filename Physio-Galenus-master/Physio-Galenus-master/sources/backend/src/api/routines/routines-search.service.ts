import { IPaginatedEntities } from '@common-interfaces/pagination.interface';
import { FilterRoutinesDto } from '@common-request-dto/filter-routines.dto';
import { FullUserDto } from '@common-response-dto/full-user.dto';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { retrievePaginatedEntities } from '@common-utils/pagination-utils';
import { isDefined } from 'src/common/utils/is-defined';
import { getPropOrDefault } from 'src/common/utils/variable-utils';
import { Routine, RoutineToExercise } from 'src/database/entity';
import { QueryRelationJoiner } from 'src/database/query-relation-joiner';
import { Connection } from 'typeorm';
import { IFilterRoutines } from '@common-interfaces/filter-routines.interface';

@Injectable()
export class RoutinesSearchService {
  private mapFiltersToSqlQueries: IFilterRoutines = {
    /**
     * Filter by "Exercise ids"
     * Find a routine with all those exercises
     */
    exercise_ids: (qb, _, exerciseIds) =>
      qb.andWhere(
        (sqb) =>
          `routine.id IN ` +
          sqb
            .subQuery()
            .select('"routineIdId"')
            .from(RoutineToExercise, 'routine_to_exercise')
            .where('"exerciseIdId" IN (:...exerciseIds)')
            .groupBy('"routineIdId"')
            .having('COUNT(*) >= :exerciseCount')
            .setParameters({ exerciseCount: exerciseIds.length, exerciseIds })
            .getQuery(),
      ),

    /**
     * Filter by "Name"
     */
    name: (qb, _, name) =>
      qb.andWhere(`routine.name ILIKE :name`, { name: `%${name}%` }),

    /**
     * Filter by "Days of Week"
     */
    daysOfWeek: (qb, _, daysOfWeek) =>
      qb.andWhere(':daysOfWeek <@ routine.repetition_weekdays', {
        daysOfWeek,
      }),

    routineStartDate: (qb, _, routineStartDate) =>
      qb.andWhere('routine.start_date <= :routineStartDate', {
        routineStartDate,
      }),

    routineEndDate: (qb, _, routineEndDate) =>
      qb.andWhere('routine.end_date >= :routineEndDate', {
        routineEndDate,
      }),
  };

  constructor(
    @InjectConnection()
    private connection: Connection,
  ) {}

  async list(
    query: FilterRoutinesDto,
    user: FullUserDto,
  ): Promise<IPaginatedEntities<Routine>> {
    const { manager } = this.connection;

    // Create query builder with the minimum required set of joins
    const qb = manager.getRepository(Routine).createQueryBuilder('routine');

    const joiner = new QueryRelationJoiner('routine', [
      'therapist',
      ...getPropOrDefault(query, 'metadata.relations', ['routine_to_exercise']),
    ])
      .setJoinerFn(qb.leftJoinAndSelect.bind(qb))
      .join();

    // Iterate over all the entries in the DTO
    if (query.data) {
      for (const [k, v] of Object.entries(query.data)) {
        // Ensure the property belongs to the DTO and is defined
        if (!isDefined(this.mapFiltersToSqlQueries[k]) || !isDefined(v)) {
          continue;
        }

        // Add the filter to the query object using the mapper object
        this.mapFiltersToSqlQueries[k](qb, joiner, v);
      }
    }

    qb.andWhere(`${joiner.alias('therapist')}.id = :therapistId`, {
      therapistId: user.id,
    });

    qb.orderBy({ 'routine.name': 'ASC' });

    return await retrievePaginatedEntities(qb, query && query.metadata);
  }
}
