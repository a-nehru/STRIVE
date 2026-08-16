import {
  Exclude,
  Expose,
  plainToClass,
  Transform,
  Type,
} from 'class-transformer';
import { CategoryWithPermissionsDto } from '../response/category-with-permissions.dto';
import { Permission } from '../../../database/entity/permission.entity';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class CategoriesWithPermissionsDto {
  @Expose({ name: 'category_with_permissions' })
  @Transform(({ obj }) =>
    Object.values(
      obj.permissions.reduce((result, permission: Permission) => {
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
          can_create: permission.has_create_action,
          can_edit: permission.has_edit_action,
          can_read: permission.has_read_action,
          can_delete: permission.has_delete_action,
          can_list: permission.has_list_action,
        });

        return result;
      }, {}),
    ).map((cwp) => plainToClass(CategoryWithPermissionsDto, cwp)),
  )
  @Type(() => CategoryWithPermissionsDto)
  @CustomApiProperty()
  readonly categories_with_permissions: CategoryWithPermissionsDto[];
}
