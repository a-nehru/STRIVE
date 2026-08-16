import { FilterChangelogChangesListDto } from '@common-request-dto/filter-changelog-changes-list.dto';
import { ChangelogChangesListDto } from '@common-response-dto/changelog-changes-list.dto';
import { CsvChangelogChangesListDto } from '@common-response-dto/csv-changelog-changes-list.dto';
import { DownloadFileResponseDto } from '@common-response-dto/download-file.dto';
import { EExportType, exportTo } from '@common-utils/export-utils';
import { makeResponse } from '@common-utils/network-utils';
import { concatStrings } from '@common-utils/string-utils';
import { changelogEndpoint } from '@config/endpoints.config';
import { Controller, Get, Query, UseGuards, UsePipes } from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { EPermission, EPermissionAction } from 'src/common/permissions';
import { CookieAuthenticationGuard } from 'src/guards/cookie-authentication.guard';
import { PermissionsGuard } from 'src/guards/permissions.guard';
import { Permissions } from 'src/guards/permissions.decorator';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { ChangelogService } from './changelog.service';

@UseGuards(CookieAuthenticationGuard, PermissionsGuard)
@Controller(changelogEndpoint.$full)
export class ChangelogController {
  constructor(private changelogsService: ChangelogService) {}

  @Permissions([
    { id: EPermission.ManageChangelog, actions: [EPermissionAction.List] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get()
  async list(
    @Query() query: FilterChangelogChangesListDto,
  ): Promise<ChangelogChangesListDto> {
    const result = await this.changelogsService.list(query);
    const dto = makeResponse(ChangelogChangesListDto, { data: result });
    return dto;
  }

  @Permissions([
    { id: EPermission.ManageChangelog, actions: [EPermissionAction.List] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get(changelogEndpoint.download.$part)
  async download(
    @Query() query: FilterChangelogChangesListDto,
  ): Promise<DownloadFileResponseDto> {
    const result = await this.changelogsService.list(query);

    const changes: CsvChangelogChangesListDto[] = [];
    for (const changelog of result) {
      for (const block of changelog.blocks) {
        for (const change of block.entries) {
          changes.push({
            version: changelog.version,
            date: changelog.date,
            type: block.label,
            description: change.description,
            pr: change.pr
              ? concatStrings(', ', ...change.pr).replace(/#/g, '')
              : '',
            trello: change.trello
              ? concatStrings(', ', ...change.trello).replace(/#/g, '')
              : '',
            jira: change.jira
              ? concatStrings(', ', ...change.jira).replace(/#/g, '')
              : '',
          });
        }
      }
    }
    const exportedData = exportTo(EExportType.CSV, changes);
    return plainToClass(DownloadFileResponseDto, { data: exportedData });
  }
}
