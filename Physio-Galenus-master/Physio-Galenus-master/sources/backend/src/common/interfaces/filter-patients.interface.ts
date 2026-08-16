import { Patient } from '../../database/entity/patient.entity';
import { QueryRelationJoiner } from '../../database/query-relation-joiner';
import { SelectQueryBuilder } from 'typeorm';

type TQueryFn<T> = (
  qb: SelectQueryBuilder<Patient>,
  joiner: QueryRelationJoiner,
  filterValue: T,
) => SelectQueryBuilder<Patient>;

export interface IFilterPatients {
  public_id?: string | TQueryFn<string>;
  email?: string | TQueryFn<string>;
  nickname?: string | TQueryFn<string>;
  gender?: string | TQueryFn<string>;
  birth_date?: string | TQueryFn<string>;
  therapist_id?: string | TQueryFn<string>;
}
