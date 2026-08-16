import { SetMetadata } from '@nestjs/common';
import {
  IPermission,
  IPermissionsData,
  IPermissionsSettings,
} from '../common/permissions';

/**
 * Protect an endpoint via the PermissionsGuard
 * @param permissions a list of IPermissionDecorator instances that a user must have to access the endpoint
 * @param settings define other additional settings for the permissions
 */
export const Permissions = (
  permissions: IPermission[],
  settings?: IPermissionsSettings,
) =>
  SetMetadata('permissionsData', {
    permissions,
    settings,
  } as IPermissionsData);
