import { EUserNotificationSubject } from '../../common/enums/user-notification-subject.enum';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';
import { User } from './user.entity';

export interface IUserNotification {
  id: string;
  user: User;
  due_date: string;
  notification_date: string;
  subject: string;
  message: string;
  is_notified: boolean;
  is_read: boolean;
  is_archived: boolean;
  is_removed: boolean;
  payload: IUserNotificationPayload;
  audit_dates?: EmbeddedAuditDates;
}

export interface IUserNotificationPayload {
  foo: string;
}

@Entity()
export class UserNotification implements IUserNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  user: User;

  @Column('date')
  due_date: string;

  @Column('date')
  notification_date: string;

  @Column('enum', {
    enum: EUserNotificationSubject,
  })
  subject: EUserNotificationSubject;

  @Column('text')
  message: string;

  @Column('bool', { default: false })
  is_notified: boolean;

  @Column('bool', { default: false })
  is_read: boolean;

  @Column('bool', { default: false })
  is_archived: boolean;

  @Column('bool', { default: false })
  is_removed: boolean;

  @Column('jsonb', { nullable: true })
  payload: IUserNotificationPayload;

  @Column(() => EmbeddedAuditDates, { prefix: false })
  audit_dates?: EmbeddedAuditDates = new EmbeddedAuditDates();
}
