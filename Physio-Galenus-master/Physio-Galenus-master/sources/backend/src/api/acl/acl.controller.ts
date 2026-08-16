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
import { plainToClass } from 'class-transformer';
import { CreateRoleDto } from '../../common/dto/request/create-role.dto';
import { CategoryWithPermissionsDto } from '../../common/dto/response/category-with-permissions.dto';
import { RoleWithPermissionsByCategoriesDto } from '../../common/dto/response/role-with-permissions-by-categories.dto';
import { EPermission, EPermissionAction } from '../../common/permissions';
import { Permission } from '../../database/entity/permission.entity';
import { Permissions } from '../../guards/permissions.decorator';
import { PermissionsGuard } from '../../guards/permissions.guard';
import { CustomValidationPipe } from '../../pipes/custom-validation.pipe';
import { AppError } from '../errors/app-error.exception';
import { ACLService } from './acl.service';
import { FilterRolesDto } from '../../common/dto/request/filter-roles.dto';
import { aclEndpoint } from '@config/endpoints.config';
import { CookieAuthenticationGuard } from 'src/guards/cookie-authentication.guard';
import { CategoriesWithPermissionsDto } from 'src/common/dto/types/categories-with-permissions.dto';
import { UpdateRolePermissionsDto } from '@common-request-dto/update-role-permissions.dto';

@UseGuards(CookieAuthenticationGuard, PermissionsGuard)
@Controller()
export class ACLController {
  constructor(private readonly aclService: ACLService) {}

  @Permissions([
    { id: EPermission.ManagePermissions, actions: [EPermissionAction.List] },
  ])
  @Get(aclEndpoint.permissions.$full)
  async findAllPermissions(): Promise<CategoryWithPermissionsDto[]> {
    const permissions: Permission[] =
      await this.aclService.findAllPermissionsWithCategory();
    const categories = plainToClass(CategoriesWithPermissionsDto, {
      permissions,
    });
    if (!categories) {
      throw new AppError({
        message: `No categories were obtained when retrieving permissions`,
      });
    }
    const permissionDtos = [...categories.categories_with_permissions];
    return permissionDtos;
  }

  @Permissions([
    { id: EPermission.ManageRoles, actions: [EPermissionAction.Create] },
  ])
  @UsePipes(CustomValidationPipe)
  @Post(`${aclEndpoint.roles.$full}/:id`)
  async createRole(
    @Param('id') paramId: string,
    @Body() createRoleDto: CreateRoleDto,
  ): Promise<RoleWithPermissionsByCategoriesDto> {
    const { id, name, description } = createRoleDto;
    if (id !== paramId) {
      throw new AppError({
        message: `IDs for creating role do not match`,
        additionalData: { paramId, dtoId: id },
      });
    }

    const role = await this.aclService.createOrUpdateRole(
      id,
      name,
      description,
    );
    const createdRoleDto = plainToClass(
      RoleWithPermissionsByCategoriesDto,
      role,
    );
    return createdRoleDto;
  }

  @Permissions([
    { id: EPermission.ManageRoles, actions: [EPermissionAction.Edit] },
  ])
  @UsePipes(CustomValidationPipe)
  @Put(`${aclEndpoint.roles.$full}/:id`)
  async updateRole(
    @Param('id') paramId: string,
    @Body() createRoleDto: CreateRoleDto,
  ): Promise<RoleWithPermissionsByCategoriesDto> {
    return await this.createRole(paramId, createRoleDto);
  }

  @Permissions([
    { id: EPermission.ManageRoles, actions: [EPermissionAction.Delete] },
  ])
  @UsePipes(CustomValidationPipe)
  @Delete(`${aclEndpoint.roles.$full}/:id`)
  async deleteRole(@Param('id') id: string): Promise<void> {
    await this.aclService.deleteRoleById(id.toUpperCase());
  }

  @Permissions([
    { id: EPermission.ManageRoles, actions: [EPermissionAction.List] },
  ])
  @Get(aclEndpoint.roles.$full)
  async findAllRoles(
    @Query() query: FilterRolesDto,
  ): Promise<RoleWithPermissionsByCategoriesDto[]> {
    const roles = await this.aclService.findAllRolesWithPermissions(query);
    const rolesWithPermissionsDto = roles.map((role) =>
      plainToClass(RoleWithPermissionsByCategoriesDto, role),
    );
    return rolesWithPermissionsDto;
  }

  @Permissions([
    { id: EPermission.ManageRoles, actions: [EPermissionAction.Read] },
  ])
  @Get(`${aclEndpoint.roles.$full}/:roleId`)
  async findOneRole(
    @Param('roleId') roleId: string,
  ): Promise<RoleWithPermissionsByCategoriesDto> {
    const role = await this.aclService.findRoleWithPermissionsById(
      roleId.toUpperCase(),
    );
    const roleWithPermissionsDto = plainToClass(
      RoleWithPermissionsByCategoriesDto,
      role,
    );
    return roleWithPermissionsDto;
  }

  @Permissions([
    { id: EPermission.ManageRoles, actions: [EPermissionAction.Edit] },
  ])
  @UsePipes(CustomValidationPipe)
  @Patch(
    `${aclEndpoint.roles.$full}/:roleId/${aclEndpoint.roles.permissions.$part}`,
  )
  async updateRolePermissions(
    @Param('roleId') roleId: string,
    @Body() updateRolePermissionsDto: UpdateRolePermissionsDto,
  ): Promise<RoleWithPermissionsByCategoriesDto> {
    if (!UpdateRolePermissionsDto.isValid(updateRolePermissionsDto)) {
      throw new AppError({
        message: `Permissions received for role ${roleId} update are not valid`,
        additionalData: {
          updateRolePermissionsDto,
        },
      });
    }

    if (
      updateRolePermissionsDto.permissionToDelete &&
      updateRolePermissionsDto.permissionToDelete.length > 0
    ) {
      await this.aclService.deleteRolePermissions(
        roleId,
        updateRolePermissionsDto.permissionToDelete.map((p) =>
          p.id.toUpperCase(),
        ),
      );
    }
    if (
      updateRolePermissionsDto.permissionToAdd &&
      updateRolePermissionsDto.permissionToAdd.length > 0
    ) {
      await this.aclService.upsertRolePermissions(
        roleId,
        updateRolePermissionsDto.permissionToAdd,
      );
    }
    if (
      updateRolePermissionsDto.permissionToEdit &&
      updateRolePermissionsDto.permissionToEdit.length > 0
    ) {
      await this.aclService.upsertRolePermissions(
        roleId,
        updateRolePermissionsDto.permissionToEdit,
      );
    }

    const updatedRole = await this.aclService.findRoleWithPermissionsById(
      roleId,
    );
    const updatedRoleWithPermissionsDto = plainToClass(
      RoleWithPermissionsByCategoriesDto,
      updatedRole,
    );
    return updatedRoleWithPermissionsDto;
  }
}
