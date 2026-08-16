import { Exclude, Expose } from 'class-transformer';
import { IsArray } from 'class-validator';
import { PermissionDto } from '../types/permission.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class UpdateUserPermissionsDto {
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

  isValid(updateUserPermissionsDto: UpdateUserPermissionsDto): boolean {
    let isValid = false;

    if (updateUserPermissionsDto) {
      const permissions = updateUserPermissionsDto.permissionToAdd.concat(
        updateUserPermissionsDto.permissionToDelete.concat(
          updateUserPermissionsDto.permissionToEdit,
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
