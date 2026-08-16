import { ICategoryWithPermissions } from '@common-response-dto-interfaces/category-with-permissions.interface';
import { Exclude, Expose, Type } from 'class-transformer';
import { PermissionDto } from '../types/permission.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class CategoryWithPermissionsDto implements ICategoryWithPermissions {
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
  @Type(() => PermissionDto)
  @CustomApiProperty()
  readonly permissions: PermissionDto[];
}
