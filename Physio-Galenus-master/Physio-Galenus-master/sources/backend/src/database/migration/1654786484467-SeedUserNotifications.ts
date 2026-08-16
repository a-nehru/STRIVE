import { EUserNotificationSubject } from 'src/common/enums/user-notification-subject.enum';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { User, UserNotification } from '../entity';
import faker = require('faker');

const userNotifications = [
  {
    message: 'Patient X has completed his/her routine 0',
    is_read: false,
    is_notified: false,
    is_archived: false,
    due_date: '01/01/2030',
    notification_date: new Date().toISOString(),
    subject: EUserNotificationSubject.Routine,
  },
  {
    message: 'Patient Y has completed his/her routine 1',
    is_read: false,
    is_notified: false,
    is_archived: false,
    due_date: '01/01/2030',
    notification_date: new Date().toISOString(),
    subject: EUserNotificationSubject.Routine,
  },
  {
    message:
      'Patient X has not done rehabilitation in week 06/06/2022 - 10/06/2022',
    is_read: false,
    is_notified: false,
    is_archived: false,
    due_date: '01/01/2030',
    notification_date: new Date().toISOString(),
    subject: EUserNotificationSubject.Routine,
  },
  {
    message:
      'Patient Y has not done rehabilitation in week 30/05/2022 - 03/06/2022',
    is_read: false,
    is_notified: false,
    is_archived: false,
    due_date: '01/01/2030',
    notification_date: new Date().toISOString(),
    subject: EUserNotificationSubject.Routine,
  },
] as UserNotification[];

export class SeedUserNotifications1654786484467 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const { manager } = queryRunner;

    const user = await manager.findOne(User, {
      where: { username: 'test@test.com' },
    });

    const notifications: UserNotification[] = [];
    for (const notification of userNotifications) {
      const created_at = faker.date.past(1);

      notifications.push({
        ...notification,
        user: { id: user.id } as User,
        audit_dates: {
          created_at,
          updated_at: created_at,
        },
      });
    }

    await manager.save(UserNotification, notifications);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
