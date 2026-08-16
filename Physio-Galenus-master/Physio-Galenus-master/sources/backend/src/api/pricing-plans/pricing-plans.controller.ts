import { pricingPlanEndpoint } from '@config/endpoints.config';
import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
import { CookieAuthenticationGuard } from 'src/guards/cookie-authentication.guard';
import { PermissionsGuard } from 'src/guards/permissions.guard';
import { Permissions } from 'src/guards/permissions.decorator';
import { PricingPlansService } from './pricing-plans.service';
import { EPermission, EPermissionAction } from 'src/common/permissions';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { FilterPricingPlansListDto } from '@common-request-dto/filter-pricing-plans.dto';
import { makeResponse } from '@common-utils/network-utils';
import { PricingPlansListDto } from '@common-response-dto/pricing-plans-list.dto';

@UseGuards(CookieAuthenticationGuard, PermissionsGuard)
@Controller(pricingPlanEndpoint.$full)
export class PricingPlansController {
  constructor(private pricingPlansService: PricingPlansService) {}

  @Permissions([
    { id: EPermission.ManagePricingPlans, actions: [EPermissionAction.List] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get(pricingPlanEndpoint.list.$part)
  async list(
    @Query() query: FilterPricingPlansListDto,
  ): Promise<PricingPlansListDto> {
    const result = await this.pricingPlansService.list(query);
    const dto = makeResponse(PricingPlansListDto, {
      data: result.entities,
      metadata: result.pagination,
    });
    return dto;
  }
}
