import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersSearchService } from './users-search.service';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { plainToClass } from 'class-transformer';
import { usersEndpoint } from '@config/endpoints.config';
import { UpdateUserDto } from '@common-request-dto/update-user.dto';
import { FullUserDto } from '@common-response-dto/full-user.dto';
import { DeletedUserDto } from '@common-response-dto/deleted-user.dto';
import { FilterUsersDto } from '@common-request-dto/filter-users.dto';
import { makeResponse } from '@common-utils/network-utils';
import {
  UserSimpleDetailsForListDto,
  SimpleUserDtoData,
} from '@common-response-dto/user-simple-details-for-list.dto';
import { PermissionsGuard } from 'src/guards/permissions.guard';
import { EPermission, EPermissionAction } from 'src/common/permissions';
import { Permissions } from 'src/guards/permissions.decorator';
import { CookieAuthenticationGuard } from 'src/guards/cookie-authentication.guard';
import { UpdateUserRolesDto } from '@common-request-dto/update-user-roles.dto';
import { UpdateUserPermissionsDto } from '@common-request-dto/update-user-permissions.dto';
import { AppError } from '../errors/app-error.exception';
import { CreateUserDto } from '@common-request-dto/create-user.dto';

@Controller(usersEndpoint.$full)
export class UsersController {
  constructor(
    private readonly usersSearchService: UsersSearchService,
    private readonly usersService: UsersService,
  ) {}

  @UseGuards(CookieAuthenticationGuard, PermissionsGuard)
  @Permissions([
    { id: EPermission.ManageUsers, actions: [EPermissionAction.List] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get()
  async findAll(@Query() query: FilterUsersDto): Promise<FullUserDto[]> {
    const users = await this.usersSearchService.findAll(query);
    const fullUsersDto = users.map((user) => plainToClass(FullUserDto, user));
    return fullUsersDto;
  }

  @UseGuards(CookieAuthenticationGuard, PermissionsGuard)
  @Permissions([
    { id: EPermission.ManageUsers, actions: [EPermissionAction.List] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get(usersEndpoint.simple.$part)
  async findSimple(
    @Query() query: FilterUsersDto,
  ): Promise<SimpleUserDtoData[]> {
    const users = await this.usersSearchService.findAll(query);
    const fullUsersDto = users.map((user) =>
      plainToClass(SimpleUserDtoData, user),
    );
    return fullUsersDto;
  }

  @UseGuards(CookieAuthenticationGuard, PermissionsGuard)
  @Permissions([
    { id: EPermission.ManageUsers, actions: [EPermissionAction.List] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get(usersEndpoint.listSimple.$part)
  async listSimple(
    @Query() query: FilterUsersDto,
  ): Promise<UserSimpleDetailsForListDto> {
    const result = await this.usersSearchService.listSimple(query);
    const userDetailsForListDto = makeResponse(UserSimpleDetailsForListDto, {
      data: result.entities,
      metadata: result.pagination,
    });
    return userDetailsForListDto;
  }

  @UseGuards(CookieAuthenticationGuard, PermissionsGuard)
  @Permissions(
    [{ id: EPermission.ManageUsers, actions: [EPermissionAction.Read] }],
    { bypassByOwnerIdParamName: 'userId' },
  )
  @UsePipes(CustomValidationPipe)
  @Get(`/:userId`)
  async fetch(@Param('userId') userId: string): Promise<FullUserDto> {
    const user = await this.usersService.getFullUser(userId);
    return plainToClass(FullUserDto, user);
  }

  @UsePipes(CustomValidationPipe)
  @Post()
  async create(@Body() body: CreateUserDto): Promise<SimpleUserDtoData> {
    const user = await this.usersService.createUser(body);
    return plainToClass(SimpleUserDtoData, user);
  }

  @UseGuards(CookieAuthenticationGuard, PermissionsGuard)
  @Permissions(
    [{ id: EPermission.ManageUsers, actions: [EPermissionAction.Edit] }],
    { bypassByOwnerIdParamName: 'userId' },
  )
  @UsePipes(CustomValidationPipe)
  @Put(`/:userId`)
  async update(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<FullUserDto> {
    const user = await this.usersService.updateUser(dto, userId);
    return plainToClass(FullUserDto, user);
  }

  @UseGuards(CookieAuthenticationGuard, PermissionsGuard)
  @Permissions([
    { id: EPermission.ManageUsers, actions: [EPermissionAction.Delete] },
  ])
  @UsePipes(CustomValidationPipe)
  @Delete(`/:userId`)
  async delete(@Param('userId') userId: string): Promise<DeletedUserDto> {
    const deletedUserId = await this.usersService.deleteUser(userId);
    return plainToClass(DeletedUserDto, { id: deletedUserId });
  }

  @UseGuards(CookieAuthenticationGuard, PermissionsGuard)
  @Permissions([
    { id: EPermission.ManageUserRoles, actions: [EPermissionAction.Edit] },
  ])
  @UsePipes(CustomValidationPipe)
  @Patch(':userId/roles')
  async updateRoles(
    @Param('userId') userId: string,
    @Body() updateUserRolesDto: UpdateUserRolesDto,
  ): Promise<FullUserDto> {
    const updatedUser = await this.usersService.updateRoles(
      userId,
      updateUserRolesDto.ids.map((id) => id.toUpperCase()),
    );
    const fullUserDto = plainToClass(FullUserDto, updatedUser);
    return fullUserDto;
  }

  @UseGuards(CookieAuthenticationGuard, PermissionsGuard)
  @Permissions([
    {
      id: EPermission.ManageUserPermissions,
      actions: [EPermissionAction.Edit],
    },
  ])
  @UsePipes(CustomValidationPipe)
  @Patch(':userId/permissions')
  async updatePermissions(
    @Param('userId') userId: string,
    @Body() updateUserPermissionsDto: UpdateUserPermissionsDto,
  ): Promise<FullUserDto> {
    if (!updateUserPermissionsDto.isValid(updateUserPermissionsDto)) {
      throw new AppError({
        message: `Permissions received for role ${userId} update are not valid`,
        additionalData: {
          updateUserPermissionsDto,
        },
      });
    }

    if (
      updateUserPermissionsDto.permissionToDelete &&
      updateUserPermissionsDto.permissionToDelete.length > 0
    ) {
      await this.usersService.deleteUserPermissions(
        userId,
        updateUserPermissionsDto.permissionToDelete.map((p) =>
          p.id.toUpperCase(),
        ),
      );
    }
    if (
      updateUserPermissionsDto.permissionToAdd &&
      updateUserPermissionsDto.permissionToAdd.length > 0
    ) {
      await this.usersService.upsertUserPermissions(
        userId,
        updateUserPermissionsDto.permissionToAdd,
      );
    }
    if (
      updateUserPermissionsDto.permissionToEdit &&
      updateUserPermissionsDto.permissionToEdit.length > 0
    ) {
      await this.usersService.upsertUserPermissions(
        userId,
        updateUserPermissionsDto.permissionToEdit,
      );
    }

    const updatedUser = await this.usersService.getFullUser(userId);
    const fullUserDto = plainToClass(FullUserDto, updatedUser);
    return fullUserDto;
  }
}
