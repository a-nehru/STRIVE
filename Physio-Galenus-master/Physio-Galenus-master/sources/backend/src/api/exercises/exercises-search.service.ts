import { IPaginatedEntities } from 'src/common/interfaces/pagination.interface';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { retrievePaginatedEntities } from '@common-utils/pagination-utils';
import { FullUserDto } from 'src/common/dto/response/full-user.dto';
import { isDefined } from 'src/common/utils/is-defined';
import { getPropOrDefault } from 'src/common/utils/variable-utils';
import { Exercise } from 'src/database/entity';
import { QueryRelationJoiner } from 'src/database/query-relation-joiner';
import { Connection, SelectQueryBuilder } from 'typeorm';
import { FilterExercisesDto } from '@common-request-dto/filter-exercises.dto';

type TQueryFn<T> = (
  qb: SelectQueryBuilder<Exercise>,
  joiner: QueryRelationJoiner,
  filterValue: T,
) => SelectQueryBuilder<Exercise>;

@Injectable()
export class ExercisesSearchService {
  private mapFiltersToSqlQueries: { [key: string]: TQueryFn<any> } = {
    /**
     * Filter by "Name"
     */
    name: (qb, joiner, name) =>
      qb.andWhere(`exercise.name ILIKE :name`, {
        name: `%${name}%`,
      }),

    /**
     * Filter by "Limbs"
     */
    limbs: (qb, joiner, limbs) =>
      qb.andWhere(`exercise.limbs @> :limbs`, {
        limbs: `{${limbs.toString()}}`,
      }),

    /**
     * Filter by "Pose Type"
     */
    pose_type: (qb, joiner, pose_type) =>
      qb.andWhere(`exercise.pose_type = :pose_type`, {
        pose_type,
      }),

    /**
     * Filter by "Pose Side"
     */
    pose_side: (qb, joiner, pose_side) => {
      return qb.andWhere(`exercise.pose_side = :pose_side`, {
        pose_side,
      });
    },

    /**
     * Filter by "Exercise Type"
     */
    exercise_type: (qb, joiner, exercise_type) =>
      qb.andWhere(`exercise.exercise_type = :exercise_type`, {
        exercise_type,
      }),
  };

  constructor(
    @InjectConnection()
    private connection: Connection,
  ) {}

  async list(
    user: FullUserDto,
    query: FilterExercisesDto,
  ): Promise<IPaginatedEntities<Exercise>> {
    const { manager } = this.connection;

    // Create query builder with the minimum required set of joins
    const qb = manager.getRepository(Exercise).createQueryBuilder('exercise');

    const joiner = new QueryRelationJoiner('exercise', [
      ...getPropOrDefault(query, 'metadata.relations', []),
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

    qb.orderBy({ 'exercise.name': 'ASC' });

    return await retrievePaginatedEntities(qb, query && query.metadata);
  }
}
