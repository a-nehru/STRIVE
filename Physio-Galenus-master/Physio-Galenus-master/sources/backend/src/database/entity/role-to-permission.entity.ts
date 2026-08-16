import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Permission } from './permission.entity';
import { Role } from './role.entity';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';
import { IPermissionCanAction } from '../../common/permissions';

@Entity()
export class RoleToPermission implements IPermissionCanAction {
  @PrimaryColumn()
  role_id: string;

  @PrimaryColumn()
  permission_id: string;

  @Column('bool', { default: false })
  can_create: boolean;

  @Column('bool', { default: false })
  can_edit: boolean;

  @Column('bool', { default: false })
  can_read: boolean;

  @Column('bool', { default: false })
  can_delete: boolean;

  @Column('bool', { default: false })
  can_list: boolean;

  @ManyToOne('Role', 'role_to_permissions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @ManyToOne('Permission', 'role_to_permissions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  @Column(() => EmbeddedAuditDates, { prefix: false })
  audit_dates?: EmbeddedAuditDates = new EmbeddedAuditDates();
}
