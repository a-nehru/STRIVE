import { IUserRequest } from '@common-interfaces/user-request.interface';
import { CreateApiKeyDto } from '@common-request-dto/create-api-key.dto';
import { FilterApiKeysDto } from '@common-request-dto/filter-api-keys.dto';
import { UpdateApiKeyDto } from '@common-request-dto/update-api-key.dto';
import { ApiKeyDetailsDto } from '@common-response-dto/api-key-details.dto';
import { makeResponse } from '@common-utils/network-utils';
import {
  Request,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { CookieAuthenticationGuard } from 'src/guards/cookie-authentication.guard';
import { PermissionsGuard } from 'src/guards/permissions.guard';
import { EPermission, EPermissionAction } from '../../common/permissions';
import { Permissions } from 'src/guards/permissions.decorator';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { AppError } from '../errors/app-error.exception';
import { ApiKeysService } from './api-keys.service';
import { apiKeysEndpoint } from '@config/endpoints.config';
import { ApiKeysListDto } from '@common-response-dto/api-keys-list.dto';

@UseGuards(CookieAuthenticationGuard, PermissionsGuard)
@Controller(apiKeysEndpoint.$full)
export class ApiKeysController {
  constructor(private apiKeysService: ApiKeysService) {}

  // List
  @Permissions([
    { id: EPermission.ManageApiKeys, actions: [EPermissionAction.List] },
  ])
  @Get()
  async list(@Query() query: FilterApiKeysDto): Promise<ApiKeysListDto> {
    const apiKeys = await this.apiKeysService.list(query);
    return makeResponse(ApiKeysListDto, {
      data: apiKeys.entities,
      metadata: apiKeys.pagination,
    });
  }

  // Fetch by key
  @Permissions([
    { id: EPermission.ManageApiKeys, actions: [EPermissionAction.Read] },
  ])
  @Get(`${apiKeysEndpoint.key.$part}/:key`)
  async fetchByKey(@Param('key') key: string): Promise<ApiKeyDetailsDto> {
    const apiKey = await this.apiKeysService.get({ where: 'key', key });
    if (!apiKey) {
      throw new AppError({
        message: `API key '${key}' not found`,
        statusCode: HttpStatus.NOT_FOUND,
      });
    }

    return makeResponse(ApiKeyDetailsDto, { data: apiKey });
  }

  // Fetch by id
  @Permissions([
    { id: EPermission.ManageApiKeys, actions: [EPermissionAction.Read] },
  ])
  @Get(':id')
  async fetch(@Param('id') id: string): Promise<ApiKeyDetailsDto> {
    const apiKey = await this.apiKeysService.get({ where: 'id', id });
    if (!apiKey) {
      throw new AppError({
        message: `API key with ID '${id}' not found`,
        statusCode: HttpStatus.NOT_FOUND,
      });
    }

    return makeResponse(ApiKeyDetailsDto, { data: apiKey });
  }

  // Create
  @Permissions([
    { id: EPermission.ManageApiKeys, actions: [EPermissionAction.Create] },
  ])
  @UsePipes(CustomValidationPipe)
  @Post()
  async create(
    @Request() { user }: IUserRequest,
    @Body() createApiKeyDto: CreateApiKeyDto,
  ): Promise<ApiKeyDetailsDto> {
    const apiKey = await this.apiKeysService.create(user, createApiKeyDto);
    if (!apiKey || !apiKey.key) {
      throw new AppError({
        message: 'Unknown error: API key could not be created.',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    }

    const apiKeyPopulated = await this.fetch(apiKey.key);
    return apiKeyPopulated;
  }

  // Update
  @Permissions([
    { id: EPermission.ManageApiKeys, actions: [EPermissionAction.Edit] },
  ])
  @UsePipes(CustomValidationPipe)
  @Patch(':id')
  async update(
    @Request() { user }: IUserRequest,
    @Body() updateApiKeyDto: UpdateApiKeyDto,
    @Param('id') id: string,
  ): Promise<ApiKeyDetailsDto> {
    const apiKey = await this.apiKeysService.update(user, updateApiKeyDto, id);
    const apiKeyPopulated = await this.fetch(apiKey.key);
    return apiKeyPopulated;
  }

  // Delete
  @Permissions([
    { id: EPermission.ManageApiKeys, actions: [EPermissionAction.Delete] },
  ])
  @Delete(':id')
  async delete(@Param('id') id: string): Promise<void> {
    await this.apiKeysService.delete(id);
  }
}
