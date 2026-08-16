import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { ICategoryWithPermissions } from '@common-response-dto-interfaces/category-with-permissions.interface';
import { IRoleWithPermissionsByCategories } from '@common-response-dto-interfaces//role-with-permissions-by-categories.dto';

export interface IFullUser {
  readonly id: string;
  readonly username: string;
  readonly is_registered: boolean;
  readonly pricing_plan: EPricingPlanType;
  readonly roles: IRoleWithPermissionsByCategories[];
  readonly categories_with_permissions: ICategoryWithPermissions[];
  readonly is_demo: boolean;
}
