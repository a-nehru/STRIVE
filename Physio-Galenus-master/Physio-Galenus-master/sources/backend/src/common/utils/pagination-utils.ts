import {
  IPaginatedEntities,
  IPagination,
} from '@common-interfaces/pagination.interface';
import { SelectQueryBuilder } from 'typeorm';

/**
 * Collects all the paginated entities filled out with all the information provided. If no
 * paginationMetadata is provided, the page will be set to 1 and the pageSize will be set to count,
 * thus retrieving all the (filtered) entities in one page.
 * @param qb the query builder to get the COUNT and to run the TAKE and SKIP methods; won't be mutated
 * @param paginationMetadata an object with the pagination information required
 */
export const retrievePaginatedEntities = async <T>(
  qb: SelectQueryBuilder<T>,
  paginationMetadata?: IPagination,
): Promise<IPaginatedEntities<T>> => {
  const queryBuilder = qb.clone();

  const count = await queryBuilder.getCount();
  let { page, pageSize } = paginationMetadata || { page: 0, pageSize: count };
  page = Number(page) || 0;
  pageSize = Number(pageSize) || count;

  const pages = Math.ceil(count / pageSize);
  page = page > pages ? 0 : page;

  const paginatedEntities = await queryBuilder
    .take(pageSize)
    .skip(pageSize * page)
    .getMany();

  return {
    entities: paginatedEntities,
    pagination: {
      // calculated
      count,

      // calculated
      perPageCount: paginatedEntities.length,

      // pass-through
      page,

      // calculated
      pages,

      // pass-through
      pageSize,

      // calculated
      totalCount: await queryBuilder.where({}).getCount(),
    },
  };
};
