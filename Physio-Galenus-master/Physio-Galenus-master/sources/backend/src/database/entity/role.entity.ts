import { Column, Entity, ManyToMany, OneToMany, PrimaryColumn } from 'typeorm';
import { RoleToPermission } from './role-to-permission.entity';
import { User } from './user.entity';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';

@Entity()
export class Role {
  @PrimaryColumn()
  id: string;

  @Column('text', { unique: true })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column('bool', { default: true })
  deletable: boolean;

  @Column('bool', { default: false })
  read_only: boolean;

  @Column('bool', { default: false })
  is_hidden: boolean;

  @OneToMany('RoleToPermission', 'role', { eager: true })
  role_to_permissions: RoleToPermission[];

  @ManyToMany('User', 'roles')
  users: User[];

  @Column(() => EmbeddedAuditDates, { prefix: false })
  audit_dates?: EmbeddedAuditDates = new EmbeddedAuditDates();
}
