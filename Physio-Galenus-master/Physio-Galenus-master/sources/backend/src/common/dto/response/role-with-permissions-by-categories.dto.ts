import {
  Exclude,
  Expose,
  plainToClass,
  Transform,
  Type,
} from 'class-transformer';
import { CategoryWithPermissionsDto } from './category-with-permissions.dto';
import { RoleToPermission, Role } from '../../../database/entity';
import { IRoleWithPermissionsByCategories } from '@common-response-dto-interfaces/role-with-permissions-by-categories.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class RoleWithPermissionsByCategoriesDto
  implements IRoleWithPermissionsByCategories
{
  @Expose()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @CustomApiProperty()
  readonly name: string;

  @Expose()
  @CustomApiProperty()
  readonly description: string;

  @Expose()
  @CustomApiProperty()
  readonly read_only: boolean;

  @Expose()
  @Transform(({ value: categories_with_permissions, obj }) => {
    if (obj instanceof Role) {
      return Object.values(
        obj.role_to_permissions.reduce(
          (result: { [index: string]: any }, rtp: RoleToPermission) => {
            const permission = rtp.permission;
            const category = permission.permission_category;

            // Create new category
            if (!result[category.id]) {
              result[category.id] = {
                id: category.id,
                name: category.name,
                description: category.description,
                permissions: [],
              };
            }

            // Append to category
            result[category.id].permissions.push({
              id: permission.id,
              name: permission.name,
              description: permission.description,
              can_create: rtp.permission.has_create_action
                ? rtp.can_create
                : undefined,
              can_edit: rtp.permission.has_edit_action
                ? rtp.can_edit
                : undefined,
              can_read: rtp.permission.has_read_action
                ? rtp.can_read
                : undefined,
              can_delete: rtp.permission.has_delete_action
                ? rtp.can_delete
                : undefined,
              can_list: rtp.permission.has_list_action
                ? rtp.can_list
                : undefined,
            });

            return result;
          },
          {},
        ),
      ).map((cwp) => plainToClass(CategoryWithPermissionsDto, cwp));
    } else {
      return categories_with_permissions;
    }
  })
  @Type(() => CategoryWithPermissionsDto)
  @CustomApiProperty()
  readonly categories_with_permissions: CategoryWithPermissionsDto[];
}
