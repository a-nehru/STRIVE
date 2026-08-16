import { Exclude, Expose } from 'class-transformer';
import { IsArray } from 'class-validator';
import { PermissionDto } from '../types/permission.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class UpdateRolePermissionsDto {
  @Expose()
  @IsArray()
  @CustomApiProperty()
  readonly permissionToAdd: PermissionDto[];

  @Expose()
  @IsArray()
  @CustomApiProperty()
  readonly permissionToEdit: PermissionDto[];

  @Expose()
  @IsArray()
  @CustomApiProperty()
  readonly permissionToDelete: PermissionDto[];

  static isValid(updateRolePermissionsDto: UpdateRolePermissionsDto): boolean {
    let isValid = false;

    if (updateRolePermissionsDto) {
      const permissions = updateRolePermissionsDto.permissionToAdd.concat(
        updateRolePermissionsDto.permissionToDelete.concat(
          updateRolePermissionsDto.permissionToEdit,
        ),
      );
      if (permissions) {
        for (const p of permissions) {
          if (
            !Object.is(p.id, undefined) &&
            (!Object.is(p.can_create, undefined) ||
              !Object.is(p.can_read, undefined) ||
              !Object.is(p.can_edit, undefined) ||
              !Object.is(p.can_delete, undefined) ||
              !Object.is(p.can_list, undefined))
          ) {
            isValid = true;
          } else {
            isValid = false;
            break;
          }
        }
      }
    }

    return isValid;
  }
}
