import { FullUserDto } from '../dto/response/full-user.dto';
import { PermissionDto } from '../dto/types/permission.dto';
import { CategoryWithPermissionsDto } from '../dto/response/category-with-permissions.dto';
import {
  comparePermissions,
  ILocalPermission,
  LocalPermission,
  missingPermission,
} from './local-permission.common';
import { EPermissionAction, IPermission } from './permission-types.common';

/**
 * Returns the list of permissions adapted from their decorator format to ILocalPermission instances
 * @param adapter the class implementing ILocalPermission to instance the resulting permissions
 * @param permissions the list of permissions as provided in the decorator format
 */
export const permissionsFromDecorator = <T extends ILocalPermission>(
  adapter: new () => T,
  permissions: IPermission[],
): ILocalPermission[] =>
  permissions.map((p) =>
    Object.assign(new adapter(), {
      id: p.id,
      [EPermissionAction.Create]:
        p.actions.includes(EPermissionAction.Create) || undefined,
      [EPermissionAction.Edit]:
        p.actions.includes(EPermissionAction.Edit) || undefined,
      [EPermissionAction.Read]:
        p.actions.includes(EPermissionAction.Read) || undefined,
      [EPermissionAction.Delete]:
        p.actions.includes(EPermissionAction.Delete) || undefined,
      [EPermissionAction.List]:
        p.actions.includes(EPermissionAction.List) || undefined,
    }),
  );

/**
 * Returns the list of missing permissions for the user. If empty, it means the user has all the
 * required permissions
 * @param userDto the full user instance that has user and role permissions
 * @param permissions the list of required permissions as IPermissionDecorator instances
 */
export const checkPermissions = (
  userDto: FullUserDto,
  permissions: IPermission[],
): { permissionId: string; missingActions: string[] }[] => {
  const lackingPermissions: {
    permissionId: string;
    missingActions: string[];
  }[] = [];
  if (!permissions || permissions.length === 0) {
    return lackingPermissions;
  }

  // Adapt the IPermissionDecorator to ILocalPermission instances
  const requiredPermissions = permissionsFromDecorator(
    LocalPermission,
    permissions,
  );
  if (!requiredPermissions || requiredPermissions.length === 0) {
    throw new Error(
      'ILocalPermissions could not be adapted from IPermissionDecorator',
    );
  }

  // Reducer to create LocalPermission instances from user's permissions in categories
  const categoriesWithPermissionsReducer = (
    acc: ILocalPermission[],
    pc: CategoryWithPermissionsDto,
  ) => {
    acc.push(
      ...pc.permissions.map((p: PermissionDto) =>
        Object.assign(new LocalPermission(), p),
      ),
    );
    return acc;
  };

  // Extract user permissions from their roles
  let rolePermissions: ILocalPermission[] = [];
  userDto.roles?.forEach((role) => {
    const localPermissions = role.categories_with_permissions.reduce(
      categoriesWithPermissionsReducer,
      [],
    );
    rolePermissions = [...rolePermissions, ...localPermissions];
  });

  // Merge user permissions and role permissions, and remove duplicated
  // permissions from roles (permissions override them)
  let userPermissions = userDto.categories_with_permissions.reduce(
    categoriesWithPermissionsReducer,
    [],
  );
  userPermissions = [
    ...userPermissions,
    ...rolePermissions.filter((rolePermission) => {
      let duplicated = false;
      for (const userPermission of userPermissions) {
        duplicated = userPermission.id === rolePermission.id;
      }
      return !duplicated;
    }),
  ];

  // Check if the user has the permissions in the required permissions array.
  // If not, a lackingPermissions array will be filled with the missing
  // permissions and their actions
  for (const rp of requiredPermissions) {
    let missingPermissions: {
      permissionId: string;
      missingActions: string[];
    }[] = [];
    let permissionFound = false;
    for (const up of userPermissions) {
      if (up.id !== rp.id) {
        // Permission IDs do not match; skip it
        continue;
      }

      // Permission ID found, check missing actions
      const permissionsCompared = comparePermissions(rp, up);
      permissionFound = !!!permissionsCompared;
      if (permissionFound) {
        missingPermissions = [];
        break;
      }

      missingPermissions.push(permissionsCompared);
    }

    if (!permissionFound) {
      if (missingPermissions.length > 0) {
        lackingPermissions.push(...missingPermissions);
      } else {
        lackingPermissions.push(missingPermission(rp));
      }
    }
  }

  // Returns the list of lacking permissions (if any) along with their actions
  return lackingPermissions;
};

export const hasPermissions = (
  userDto: FullUserDto,
  permissions: IPermission[],
): boolean => checkPermissions(userDto, permissions).length === 0;
