import { IPaginatedEntities } from '@common-interfaces/pagination.interface';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { retrievePaginatedEntities } from '@common-utils/pagination-utils';
import { FilterUsersDto } from 'src/common/dto/request/filter-users.dto';
import { isDefined } from 'src/common/utils/is-defined';
import { getPropOrDefault } from 'src/common/utils/variable-utils';
import { User } from 'src/database/entity';
import { QueryRelationJoiner } from 'src/database/query-relation-joiner';
import { Connection, SelectQueryBuilder } from 'typeorm';

type TQueryFn<T> = (
  qb: SelectQueryBuilder<User>,
  joiner: QueryRelationJoiner,
  filterValue: T,
) => SelectQueryBuilder<User>;

@Injectable()
export class UsersSearchService {
  private mapFiltersToSqlQueries: { [key: string]: TQueryFn<any> } = {
    /**
     * Filter by "Username"
     */
    username: (qb, joiner, username) =>
      qb.andWhere(`user.username ILIKE :username`, {
        username: `%${username}%`,
      }),
  };

  private simpleRelations = ['pricing_plan'];
  private fullRelations = [
    'pricing_plan',
    'roles.role_to_permissions.permission.permission_category',
    'user_to_permissions.permission.permission_category',
    'routines',
    'patients',
  ];

  constructor(
    @InjectConnection()
    private connection: Connection,
  ) {}

  async listSimple(query: FilterUsersDto): Promise<IPaginatedEntities<User>> {
    const qb = this.createQB(query, this.simpleRelations);
    return await retrievePaginatedEntities(qb, query && query.metadata);
  }

  async findAll(query: FilterUsersDto): Promise<User[]> {
    const qb = this.createQB(query, this.fullRelations);
    return await qb.getMany();
  }

  async findSimple(query: FilterUsersDto): Promise<User[]> {
    const qb = this.createQB(query, this.simpleRelations);
    return await qb.getMany();
  }

  private createQB(
    query: FilterUsersDto,
    relations: string[],
  ): SelectQueryBuilder<User> {
    const { manager } = this.connection;
    // Create query builder with the minimum required set of joins
    const qb = manager.getRepository(User).createQueryBuilder('user');

    const joiner = new QueryRelationJoiner('user', [
      ...getPropOrDefault(query, 'metadata.relations', relations),
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

    qb.orderBy({ 'user.username': 'ASC' });
    return qb;
  }
}
