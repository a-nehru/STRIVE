import { IPaginatedEntities } from '@common-interfaces/pagination.interface';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { retrievePaginatedEntities } from '@common-utils/pagination-utils';
import { FilterPatientsDto } from 'src/common/dto/request/filter-patients.dto';
import { FullUserDto } from 'src/common/dto/response/full-user.dto';
import { isDefined } from 'src/common/utils/is-defined';
import { getPropOrDefault } from 'src/common/utils/variable-utils';
import { Patient } from 'src/database/entity';
import { QueryRelationJoiner } from 'src/database/query-relation-joiner';
import { Connection } from 'typeorm';
import { IFilterPatients } from '@common-interfaces/filter-patients.interface';

@Injectable()
export class PatientsSearchService {
  private mapFiltersToSqlQueries: IFilterPatients = {
    /**
     * Filter by "Public ID"
     */
    public_id: (qb, _, public_id) =>
      qb.andWhere(`patient.public_id = :public_id`, {
        public_id,
      }),

    /**
     * Filter by "Birht Date"
     */
    birth_date: (qb, _, birth_date) =>
      qb.andWhere(`patient.birth_date = :birth_date`, {
        birth_date,
      }),

    /**
     * Filter by "Nickname"
     */
    nickname: (qb, _, nickname) =>
      qb.andWhere(`patient.nickname ILIKE :nickname`, {
        nickname,
      }),

    /**
     * Filter by "Gender"
     */
    gender: (qb, _, gender) =>
      qb.andWhere(`patient.gender = :gender`, {
        gender,
      }),

    /**
     * Filter by "Email"
     */
    email: (qb, _, email) =>
      qb.andWhere(`patient.email ILIKE :email`, {
        email: `%${email}%`,
      }),

    /**
     * Filter by "Therapist id"
     */
    therapist_id: (qb, joiner, therapistId) =>
      qb.andWhere(`${joiner.alias('therapist')}.id = :therapistId`, {
        therapistId,
      }),
  };

  constructor(
    @InjectConnection()
    private connection: Connection,
  ) {}

  async list(
    user: FullUserDto,
    query: FilterPatientsDto,
  ): Promise<IPaginatedEntities<Patient>> {
    const { manager } = this.connection;

    // Create query builder with the minimum required set of joins
    const qb = manager.getRepository(Patient).createQueryBuilder('patient');

    const joiner = new QueryRelationJoiner('patient', [
      'therapist',
      ...getPropOrDefault(query, 'metadata.relations', [
        'user',
        'routine',
        'routine_execution_data',
      ]),
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

    qb.andWhere('patient.therapist.id = :therapistId', {
      therapistId: user.id,
    });

    qb.orderBy({ 'patient.public_id': 'ASC' });

    return await retrievePaginatedEntities(qb, query && query.metadata);
  }
}
