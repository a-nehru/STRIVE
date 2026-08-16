import { QueryRelationJoiner } from '../../database/query-relation-joiner';
import { SelectQueryBuilder } from 'typeorm';
import { Routine } from '../../database/entity/routine.entity';

type TQueryFn<T> = (
  qb: SelectQueryBuilder<Routine>,
  joiner: QueryRelationJoiner,
  filterValue: T,
) => SelectQueryBuilder<Routine>;

export interface IFilterRoutines {
  exercise_ids?: string[] | TQueryFn<string[]>;
  name?: string | TQueryFn<string>;
  daysOfWeek?: string[] | TQueryFn<string[]>;
  routineStartDate?: string | TQueryFn<string>;
  routineEndDate?: string | TQueryFn<string>;
}
