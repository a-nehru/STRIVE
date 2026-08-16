import {
  Controller,
  Get,
  Query,
  UseGuards,
  UsePipes,
  Request,
} from '@nestjs/common';

import { CookieAuthenticationGuard } from 'src/guards/cookie-authentication.guard';
import { PermissionsGuard } from 'src/guards/permissions.guard';
import { EPermission, EPermissionAction } from 'src/common/permissions';
import { Permissions } from 'src/guards/permissions.decorator';
import { statisticsEndpoint } from '@config/endpoints.config';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { GetSummarizedStatisticsDto } from '@common-request-dto/get-summarized-statistics.dto';
import { SummarizedStatisticsDto } from '@common-response-dto/summarized-statistics.dto';
import { plainToClass } from 'class-transformer';
import { StatisticsService } from './statistics.service';

@UseGuards(CookieAuthenticationGuard, PermissionsGuard)
@Controller(statisticsEndpoint.$full)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Permissions([
    {
      id: EPermission.ManageSummarizedStatistics,
      actions: [EPermissionAction.Read],
    },
  ])
  @UsePipes(CustomValidationPipe)
  @Get()
  async fetchSummarizedStatistics(
    @Request() { user },
    @Query() dto: GetSummarizedStatisticsDto,
  ): Promise<SummarizedStatisticsDto> {
    const stats = await this.statisticsService.getSummarizedStatistics(
      dto,
      user,
    );
    return plainToClass(SummarizedStatisticsDto, stats);
  }
}
