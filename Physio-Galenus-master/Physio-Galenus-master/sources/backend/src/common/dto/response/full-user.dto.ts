import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { IFullUser } from '@common-response-dto-interfaces/full-user.interface';
import { Exclude, Expose, plainToClass, Transform } from 'class-transformer';
import { UserToPermission, Role } from '../../../database/entity';
import { CategoryWithPermissionsDto } from './category-with-permissions.dto';
import { RoleWithPermissionsByCategoriesDto } from './role-with-permissions-by-categories.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class FullUserDto implements IFullUser {
  @Expose()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @CustomApiProperty()
  readonly username: string;

  @Expose({ name: 'demo_patient' })
  @Transform(({ value: demo_patient }) => demo_patient?.id)
  @CustomApiProperty()
  readonly demo_patient_id?: string;

  @Expose({ name: 'patients' })
  @Transform(({ value: patients }) =>
    patients?.map((patient: { id: string }) => patient.id),
  )
  @CustomApiProperty()
  readonly patient_ids: string[];

  @Expose()
  @CustomApiProperty()
  is_registered: boolean;

  @Expose()
  @Transform(({ value: pricing_plan }) => pricing_plan?.type)
  @CustomApiProperty()
  readonly pricing_plan: EPricingPlanType;

  @Expose()
  @Transform(({ value: roles }) =>
    roles
      ?.map((role: Role) => {
        const categories_with_permissions = Object.values(
          role.role_to_permissions.reduce(
            (result: { [index: string]: any }, roleToPermission) => {
              const permission = roleToPermission.permission;
              const category = permission.permission_category;

              // Create new category
              if (!result[category.id]) {
                result[category.id] = {
                  id: category.id,
                  name: category.name,
                  description: permission.permission_category.description,
                  permissions: [],
                };
              }

              // Append to category
              result[category.id].permissions.push({
                id: roleToPermission.permission.id,
                name: permission.name,
                description: roleToPermission.permission.description,
                can_create: roleToPermission.can_create,
                can_edit: roleToPermission.can_edit,
                can_read: roleToPermission.can_read,
                can_delete: roleToPermission.can_delete,
                can_list: roleToPermission.can_list,
              });

              return result;
            },
            {},
          ),
        );
        const { role_to_permissions, ...rest } = role;
        return { ...rest, categories_with_permissions };
      })
      .map((rwpbc: any) =>
        plainToClass(RoleWithPermissionsByCategoriesDto, rwpbc),
      ),
  )
  @CustomApiProperty()
  readonly roles: RoleWithPermissionsByCategoriesDto[];

  @Expose()
  @CustomApiProperty()
  readonly is_demo: boolean;

  @Expose({ name: 'user_to_permissions' })
  @Transform(
    ({ value: user_to_permissions }) =>
      user_to_permissions &&
      Object.values(
        user_to_permissions.reduce(
          (result: { [index: string]: any }, utp: UserToPermission) => {
            const permission = utp.permission;
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
              can_create: utp.permission.has_create_action
                ? utp.can_create
                : undefined,
              can_edit: utp.permission.has_edit_action
                ? utp.can_edit
                : undefined,
              can_read: utp.permission.has_read_action
                ? utp.can_read
                : undefined,
              can_delete: utp.permission.has_delete_action
                ? utp.can_delete
                : undefined,
              can_list: utp.permission.has_list_action
                ? utp.can_list
                : undefined,
            });

            return result;
          },
          {},
        ),
      ).map((cwp) => plainToClass(CategoryWithPermissionsDto, cwp)),
  )
  @CustomApiProperty()
  readonly categories_with_permissions: CategoryWithPermissionsDto[];
}
