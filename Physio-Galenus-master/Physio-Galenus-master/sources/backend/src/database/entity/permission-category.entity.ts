import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { Permission } from './permission.entity';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';

@Entity()
export class PermissionCategory {
  @PrimaryColumn()
  id: string;

  @Column('text', { unique: true })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @OneToMany('Permission', 'permissionCategory')
  permissions: Permission[];

  @Column(() => EmbeddedAuditDates, { prefix: false })
  audit_dates?: EmbeddedAuditDates = new EmbeddedAuditDates();
}
