export interface IPermission {
  id: string;
  name?: string;
  description?: string;
  can_create?: boolean;
  can_edit?: boolean;
  can_read?: boolean;
  can_delete?: boolean;
  can_list?: boolean;
}
