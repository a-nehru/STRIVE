import { PermissionActionType } from './permission-types.common';

export interface ILocalPermission extends PermissionActionType {
  readonly id: string;
}

export class LocalPermission implements ILocalPermission {
  private _id: string;

  get id(): string {
    return this._id;
  }

  set id(newId: string) {
    this._id = newId.toUpperCase();
  }
}

export const comparePermissions = (
  permission1: ILocalPermission,
  permission2: ILocalPermission,
): { permissionId: string; missingActions: string[] } | any => {
  const equalsAction = (
    actionName: string,
    action1: boolean | undefined,
    action2: boolean | undefined,
  ) =>
    !Object.is(action1, undefined)
      ? { actionName, equals: action1 === action2 }
      : { actionName, equals: true };

  const equalsIds = permission1.id === permission2.id;
  const actions = [
    equalsAction('Create', permission1.can_create, permission2.can_create),
    equalsAction('Edit', permission1.can_edit, permission2.can_edit),
    equalsAction('Read', permission1.can_read, permission2.can_read),
    equalsAction('Delete', permission1.can_delete, permission2.can_delete),
    equalsAction('List', permission1.can_list, permission2.can_list),
  ];
  const equals = equalsIds && actions.every((val) => val.equals === true);
  const missingActions = actions
    .filter((val) => !val.equals)
    .map((val) => val.actionName);

  return equals ? null : { permissionId: permission1.id, missingActions };
};

export const missingPermission = (
  permission1: ILocalPermission,
): { permissionId: string; missingActions: string[] } => {
  const equalsAction = (actionName: string, action1: boolean | undefined) =>
    !Object.is(action1, undefined)
      ? { actionName, equals: false }
      : { actionName, equals: true };
  const actions = [
    equalsAction('Create', permission1.can_create),
    equalsAction('Edit', permission1.can_edit),
    equalsAction('Read', permission1.can_read),
    equalsAction('Delete', permission1.can_delete),
    equalsAction('List', permission1.can_list),
  ];
  const missingActions = actions
    .filter((val) => !val.equals)
    .map((val) => val.actionName);

  return { permissionId: permission1.id, missingActions };
};
