import { IPaginatedEntities } from '@common-interfaces/pagination.interface';
import { FilterUserNotificationsDto } from '@common-request-dto/filter-user-notifications.dto';
import {
  UpdateUserNotificationDto,
  UpdateUserNotificationDtoData,
} from '@common-request-dto/update-user-notification.dto';
import { FullUserDto } from '@common-response-dto/full-user.dto';
import { isDefined } from '@common-utils/is-defined';
import { retrievePaginatedEntities } from '@common-utils/pagination-utils';
import { getValueOrDefault } from '@common-utils/variable-utils';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectRepository } from '@nestjs/typeorm';
import { UserNotification } from 'src/database/entity';
import { Connection, Repository } from 'typeorm';
import { AppError } from '../errors/app-error.exception';

@Injectable()
export class UserNotificationsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectRepository(UserNotification)
    private readonly userNotificationRepo: Repository<UserNotification>,
  ) {}

  async list(
    user: FullUserDto,
    query: FilterUserNotificationsDto,
  ): Promise<IPaginatedEntities<UserNotification>> {
    const qb = this.userNotificationRepo
      .createQueryBuilder('userNotification')
      .leftJoinAndSelect('userNotification.user', 'user')
      .where('user.id = :userId', { userId: user.id });
    if (query && query.data) {
      const {
        is_removed,
        is_archived,
        is_read,
        is_notified,
        notification_date,
        start_date_range,
        end_date_range,
        subject,
      } = query.data;
      qb.andWhere(
        isDefined(is_archived)
          ? 'userNotification.is_archived = :is_archived'
          : '1=1',
        {
          is_archived,
        },
      );
      qb.andWhere(
        isDefined(is_read) ? 'userNotification.is_read = :is_read' : '1=1',
        {
          is_read,
        },
      );
      qb.andWhere(
        isDefined(is_notified)
          ? 'userNotification.is_notified = :is_notified'
          : '1=1',
        {
          is_notified,
        },
      );
      qb.andWhere(
        isDefined(is_removed)
          ? 'userNotification.is_removed = :is_removed'
          : '1=1',
        {
          is_removed,
        },
      );
      qb.andWhere(
        notification_date
          ? 'userNotification.notification_date = :notification_date'
          : '1=1',
        {
          notification_date,
        },
      );
      qb.andWhere(
        start_date_range
          ? 'userNotification.notification_date >= :start_date_range'
          : '1=1',
        {
          start_date_range,
        },
      );
      qb.andWhere(
        end_date_range
          ? 'userNotification.notification_date <= :end_date_range'
          : '1=1',
        {
          end_date_range,
        },
      );
      qb.andWhere(subject ? 'userNotification.subject <= :subject' : '1=1', {
        subject,
      });
    }

    if (query && query.metadata) {
      const { orderBy } = query.metadata;
      qb.orderBy(orderBy || { 'userNotification.notification_date': 'DESC' });
    }

    return await retrievePaginatedEntities(qb, query && query.metadata);
  }

  async update(
    id: string,
    dto: UpdateUserNotificationDto,
  ): Promise<UserNotification> {
    const userNotification = await this.userNotificationRepo.findOne(id);
    if (!userNotification) {
      throw new AppError({
        message: `User notification ${id} was not found`,
        statusCode: HttpStatus.NOT_FOUND,
      });
    }

    userNotification.is_archived = getValueOrDefault(
      dto.is_archived,
      userNotification.is_archived,
    );
    userNotification.is_read = getValueOrDefault(
      dto.is_read,
      userNotification.is_read,
    );
    userNotification.is_notified = getValueOrDefault(
      dto.is_notified,
      userNotification.is_notified,
    );
    userNotification.is_removed = getValueOrDefault(
      dto.is_removed,
      userNotification.is_removed,
    );

    await this.userNotificationRepo.save(userNotification);
    return userNotification;
  }

  async bulkUpdate(
    dto: UpdateUserNotificationDtoData,
  ): Promise<UserNotification[]> {
    const { manager } = this.connection;

    const notifications: UserNotification[] = [];
    await manager.transaction(async (em) => {
      const userNotificationRepo = em.getRepository(UserNotification);

      for (const notification of dto.data) {
        notifications.push({ ...notification } as UserNotification);
      }

      userNotificationRepo.save(notifications, { chunk: 10 });
    });
    return notifications;
  }

  async delete(ids: string[]): Promise<boolean> {
    const deleted = await this.userNotificationRepo.delete(ids);
    return deleted.affected > 0;
  }
}
