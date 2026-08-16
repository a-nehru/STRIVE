import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToClass } from 'class-transformer';
import { AppError } from '../api/errors/app-error.exception';
import { FullUserDto } from '../common/dto/response/full-user.dto';
import { checkPermissions, IPermissionsData } from '../common/permissions';

/**
 * ACLGuard will check the user's permissions and roles permissions. That is, it
 * will pass if and only if the user has the set of permissions stated in
 * user.roles.permissions and user.permissions.
 *
 * Using the decorator:
 * ```
 * @Permissions(
 *     { id: EPermission.ManageReferrals, actions: [EPermissionActions.Read] },
 *     { id: EPermission.ManageClients, actions: [EPermissionActions.Create, EPermissionActions.Delete] },
 * )
 * ```
 * This will only pass if the user has the set of permissions defined by the
 * above decorator.
 *
 * To grant access to the user owning the resource, one can just use the next decorator:
 * ```
 * @PermissionsEnableOwner({ ownerIdParamName: 'userId' })
 * ```
 * With the param used to compare with the user.id property. If the user IDs match,
 * the user will be granted access even if there are any @Permissions() annotation
 * which permissions are not met.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissionsData = this.reflector.get<IPermissionsData>(
      'permissionsData',
      context.getHandler(),
    );
    const requiredPermissions = permissionsData && permissionsData.permissions;
    const bypassByOwnerIdParamName =
      permissionsData &&
      permissionsData.settings &&
      permissionsData.settings.bypassByOwnerIdParamName;

    let canActivate = false;

    // The list of possible raising errors
    const errorMsgs = [];

    // Return early if no decorators at all
    if (
      !bypassByOwnerIdParamName &&
      (!requiredPermissions || requiredPermissions.length <= 0)
    ) {
      return true;
    }

    // Retrieve the user from the network request
    const request = context.switchToHttp().getRequest();

    const user =
      request.user instanceof FullUserDto
        ? request.user
        : plainToClass(FullUserDto, request.user);

    // @Permissions(...) decorator exists
    if (requiredPermissions && requiredPermissions.length > 0) {
      // Check if the user has any lacking permission
      const lackingPermissions = checkPermissions(user, requiredPermissions);
      canActivate = lackingPermissions.length <= 0;

      // If any lacking permissions, push them into the list of error messages
      if (!canActivate) {
        const permissionsIds = lackingPermissions
          .map((p) => `${p.permissionId} [${p.missingActions.join(', ')}]`)
          .join(', ');
        errorMsgs.push(
          `Cannot access ${request.path}. Missing permissions: ${permissionsIds}.`,
        );
      } else {
        // The @Permissions(...) decorator has a higher precedence than any other, so if the user
        // satisfies it, then they can pass the guard without having to check for any others
        return true;
      }
    }

    if (bypassByOwnerIdParamName) {
      if (request.params) {
        const otherUserId = request.params[bypassByOwnerIdParamName];
        canActivate = otherUserId === user.id;

        // If the user accessing the endpoint is not the owner of the resource,
        // then push an error into the list of error messages
        if (!canActivate) {
          errorMsgs.push(
            `Cannot access ${request.path}. The requesting user (${user.id}) is not the owner of\
              the resource from the other user (${otherUserId})`,
          );
        }
      } else {
        errorMsgs.push(
          `Cannot access ${request.path}. The requesting user (${user.id}) has not provided any param.`,
        );
      }
    }

    if (!canActivate) {
      throw new AppError({
        message: errorMsgs.join(' / '),
        statusCode: HttpStatus.FORBIDDEN,
      });
    }

    return canActivate;
  }
}
