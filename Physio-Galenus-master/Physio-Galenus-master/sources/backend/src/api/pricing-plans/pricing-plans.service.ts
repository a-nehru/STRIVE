import { IPaginatedEntities } from '@common-interfaces/pagination.interface';
import { FilterPricingPlansListDto } from '@common-request-dto/filter-pricing-plans.dto';
import { isDefined } from '@common-utils/is-defined';
import { retrievePaginatedEntities } from '@common-utils/pagination-utils';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PricingPlan } from 'src/database/entity';
import { Repository } from 'typeorm';

@Injectable()
export class PricingPlansService {
  constructor(
    @InjectRepository(PricingPlan)
    private readonly pricingPlanRepo: Repository<PricingPlan>,
  ) {}

  async list(
    query?: FilterPricingPlansListDto,
  ): Promise<IPaginatedEntities<PricingPlan>> {
    const qb = this.pricingPlanRepo.createQueryBuilder('pricingPlan');

    if (query && query.data) {
      const { type, price } = query.data;

      qb.where(isDefined(type) ? `pricingPlan.type = '${type}'` : '1=1');
      qb.where(isDefined(price) ? `pricingPlan.price = '${price}'` : '1=1');
    }

    if (query && query.metadata) {
      const { orderBy } = query.metadata;
      qb.orderBy(orderBy);
    }

    return await retrievePaginatedEntities(qb, query && query.metadata);
  }
}
