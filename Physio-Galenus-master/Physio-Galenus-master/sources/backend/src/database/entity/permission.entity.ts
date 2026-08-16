import { Column, Entity, ManyToOne, OneToMany, PrimaryColumn } from 'typeorm';
import { PermissionCategory } from './permission-category.entity';
import { RoleToPermission } from './role-to-permission.entity';
import { UserToPermission } from './user-to-permission.entity';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';
import { IPermissionHasAction } from '../../common/permissions';

@Entity()
export class Permission implements IPermissionHasAction {
  @PrimaryColumn()
  id: string;

  @Column('text', { unique: true })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('bool', { default: false })
  has_create_action: boolean;

  @Column('bool', { default: false })
  has_edit_action: boolean;

  @Column('bool', { default: false })
  has_read_action: boolean;

  @Column('bool', { default: false })
  has_delete_action: boolean;

  @Column('bool', { default: false })
  has_list_action: boolean;

  @ManyToOne('PermissionCategory', 'permissions', { onDelete: 'CASCADE' })
  permission_category: PermissionCategory;

  @OneToMany('RoleToPermission', 'permission', { eager: true, cascade: true })
  role_to_permissions: RoleToPermission[];

  @OneToMany('UserToPermission', 'permission', { eager: true, cascade: true })
  user_to_permissions: UserToPermission[];

  @Column(() => EmbeddedAuditDates, { prefix: false })
  audit_dates?: EmbeddedAuditDates = new EmbeddedAuditDates();
}
