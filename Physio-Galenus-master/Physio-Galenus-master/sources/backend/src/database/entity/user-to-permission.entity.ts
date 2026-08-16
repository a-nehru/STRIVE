import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Permission } from './permission.entity';
import { User } from './user.entity';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';
import { IPermissionCanAction } from '../../common/permissions';

@Entity()
export class UserToPermission implements IPermissionCanAction {
  @PrimaryColumn('uuid')
  user_id: string;

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

  @ManyToOne('User', 'user_to_permissions', {
    onDelete: 'CASCADE',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne('Permission', 'user_to_permissions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  @Column(() => EmbeddedAuditDates, { prefix: false })
  audit_dates?: EmbeddedAuditDates = new EmbeddedAuditDates();
}
