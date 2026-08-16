import { Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectRepository } from '@nestjs/typeorm';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Connection, Repository } from 'typeorm';
import { Logger } from 'winston';
import { Permission, Role, RoleToPermission } from '../../database/entity';
import { AppError } from '../errors/app-error.exception';
import { FilterRolesDto } from '../../common/dto/request/filter-roles.dto';
import { QueryRelationJoiner } from '../../database/query-relation-joiner';
import { PermissionDto } from 'src/common/dto/types/permission.dto';

@Injectable()
export class ACLService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    @InjectRepository(Permission)
    private readonly permissionsRepo: Repository<Permission>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async findAllPermissionsWithCategory(): Promise<Permission[]> {
    const permissions = await this.permissionsRepo
      .createQueryBuilder('permission')
      .innerJoinAndSelect('permission.permission_category', 'pc')
      .getMany();

    if (!permissions || permissions.length <= 0) {
      throw new AppError({
        message: `Unknwn error: permissions could not be retrieved`,
      });
    }

    return permissions;
  }

  async findAllRolesWithPermissions(query?: FilterRolesDto): Promise<Role[]> {
    const qb = this.rolesRepo.createQueryBuilder('role');
    new QueryRelationJoiner('role', [
      'role_to_permissions.permission.permission_category',
    ])
      .setJoinerFn(qb.leftJoinAndSelect.bind(qb))
      .join();

    if (query && query.data) {
      const { isHidden } = query.data;
      qb.where(
        `${isHidden}` === 'true'
          ? `role.is_hidden = true`
          : 'role.is_hidden = false',
      );
    }

    return await qb.orderBy('role.id', 'ASC').getMany();
  }

  async createOrUpdateRole(
    id: string,
    name: string,
    description: string,
  ): Promise<Role> {
    const roleCreated = this.rolesRepo.create({ id, name, description });
    if (!roleCreated) {
      throw new AppError({ message: `Role ${id} could not be created` });
    }

    const role = await this.rolesRepo.save(roleCreated);
    if (!role) {
      throw new AppError({
        message: `Role ${id} could not be inserted or updated into the database`,
      });
    }

    const createdRole = this.findRoleWithPermissionsById(id);

    return createdRole;
  }

  async deleteRoleById(id: string): Promise<void> {
    const role = await this.rolesRepo.findOne({ where: { id } });
    if (!role) {
      throw new AppError({ message: `Role ${id} not found` });
    }
    if (!role.deletable) {
      throw new AppError({
        message: `Role ${id} cannot be removed from the system`,
      });
    }

    const deleteResult = await this.rolesRepo.delete({ id: role.id });
    if (deleteResult.affected <= 0) {
      throw new AppError({
        message: `Role ${id} could not be deleted from the database`,
      });
    }
  }

  async findRoleWithPermissionsById(id: string): Promise<Role> {
    return await this.rolesRepo
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.role_to_permissions', 'rtp')
      .leftJoinAndSelect('rtp.permission', 'rp')
      .leftJoinAndSelect('rp.permission_category', 'rpc')
      .where('role.id = :id', { id })
      .getOne();
  }

  async upsertRolePermissions(
    roleId: string,
    permissions: PermissionDto[],
  ): Promise<void> {
    const { manager } = this.connection;
    return await manager.transaction(async (em) => {
      const role = await em
        .getRepository(Role)
        .createQueryBuilder('role')
        .where('role.id = :roleId', { roleId })
        .getOne();
      if (!role) {
        throw new AppError({ message: `Role ${roleId} not found` });
      }
      const permissionsQuery = em
        .getRepository(Permission)
        .createQueryBuilder('permission')
        .leftJoinAndSelect('permission.permission_category', 'pc');

      for (const p of permissions) {
        const pBD = await permissionsQuery
          .clone()
          .where('permission.id = :id', { id: p.id })
          .getOne();
        if (!pBD) {
          this.logger.warn(
            `Permission ${p.id} not found in the database; ignoring...`,
          );
          continue;
        }
        const upsertRTP = em.create(RoleToPermission, {
          role_id: roleId,
          permission_id: p.id,
          can_create: p.can_create,
          can_edit: p.can_edit,
          can_read: p.can_read,
          can_delete: p.can_delete,
          can_list: p.can_list,
        });
        em.getRepository(RoleToPermission).save(upsertRTP);
      }
    });
  }

  async deleteRolePermissions(
    role_id: string,
    permissionIds: string[],
  ): Promise<void> {
    let deletedPermissions = 0;
    const { manager } = this.connection;
    return await manager.transaction(async (em) => {
      for (const permission_id of permissionIds) {
        const foundPermission = await em
          .getRepository(RoleToPermission)
          .createQueryBuilder('role_to_permission')
          .where('role_to_permission.role_id = :role_id', { role_id })
          .andWhere('role_to_permission.permission_id = :permission_id', {
            permission_id,
          });
        if (!foundPermission) {
          this.logger.warn(
            `Permission ${permission_id} could not be removed because it wasn't even assigned for the role ${role_id}; ignoring...`,
          );
          continue;
        }
        const deleteResult = await manager
          .getRepository(RoleToPermission)
          .delete({ role_id, permission_id });
        if (deleteResult.affected <= 0) {
          throw new AppError({
            message: `Permission ${permission_id} could not be deleted from the database`,
            additionalData: {
              deleteResult,
            },
          });
        }
        deletedPermissions++;
      }

      if (deletedPermissions <= 0) {
        throw new AppError({
          message: `No permissions could be removed for role ${role_id}`,
          additionalData: {
            permissionsToBeRemoved: permissionIds,
          },
        });
      }
    });
  }
}
