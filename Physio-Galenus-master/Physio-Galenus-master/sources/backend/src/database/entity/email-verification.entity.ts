import { add } from 'date-fns';
import {
  AfterLoad,
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';
import { appConfig } from '../../config/app.config';
import { timestampColumnOptions } from '../base/timestamp-column-options';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';

@Entity()
export class EmailVerification {
  @PrimaryColumn('text')
  email: string;

  @Column('text')
  token: string;

  @Column(timestampColumnOptions)
  expired_at: Date;

  @Column(() => EmbeddedAuditDates, { prefix: false })
  audit_dates?: EmbeddedAuditDates = new EmbeddedAuditDates();

  @BeforeInsert()
  @BeforeUpdate()
  updateExpiredAt(): void {
    this.expired_at = add(
      this.audit_dates?.created_at || new Date(),
      appConfig.auth.verificationEmailExpirationTime,
    );
  }
}
