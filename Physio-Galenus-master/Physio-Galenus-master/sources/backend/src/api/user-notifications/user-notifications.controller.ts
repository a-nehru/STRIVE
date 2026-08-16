import { FilterUserNotificationsDto } from '@common-request-dto/filter-user-notifications.dto';
import { makeResponse } from '@common-utils/network-utils';
import { userNotifEndpoint } from '@config/endpoints.config';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { EPermission, EPermissionAction } from 'src/common/permissions';
import { Permissions } from 'src/guards/permissions.decorator';
import { CookieAuthenticationGuard } from 'src/guards/cookie-authentication.guard';
import { PermissionsGuard } from 'src/guards/permissions.guard';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { UserNotificationsService } from './user-notifications.service';
import { UserNotificationDetailsForListDto } from '@common-response-dto/user-notification-details-for-list.dto';
import { AppError } from '../errors/app-error.exception';
import {
  UpdateUserNotificationDto,
  UpdateUserNotificationDtoData,
} from '@common-request-dto/update-user-notification.dto';
import { plainToClass } from 'class-transformer';
import { FullUserNotification } from '@common-request-dto/full-user-notification.dto';

@UseGuards(CookieAuthenticationGuard, PermissionsGuard)
@Controller(userNotifEndpoint.$full)
export class UserNotificationsController {
  constructor(private readonly userNotifsService: UserNotificationsService) {}

  @Permissions([
    {
      id: EPermission.ManageUserNotifications,
      actions: [EPermissionAction.List],
    },
  ])
  @UsePipes(CustomValidationPipe)
  @Get()
  async list(
    @Request() { user },
    @Query() query: FilterUserNotificationsDto,
  ): Promise<UserNotificationDetailsForListDto> {
    const result = await this.userNotifsService.list(user, query);
    const notificationDetailsForListDto = makeResponse(
      UserNotificationDetailsForListDto,
      {
        data: result.entities,
        metadata: result.pagination,
      },
    );
    return notificationDetailsForListDto;
  }

  @Permissions([
    {
      id: EPermission.ManageUserNotifications,
      actions: [EPermissionAction.Edit],
    },
  ])
  @UsePipes(CustomValidationPipe)
  @Patch(userNotifEndpoint.update.$part)
  async bulkUpdate(
    @Body() dto: UpdateUserNotificationDtoData,
  ): Promise<UserNotificationDetailsForListDto> {
    const result = await this.userNotifsService.bulkUpdate(dto);
    return plainToClass(UserNotificationDetailsForListDto, { data: result });
  }

  @Permissions([
    {
      id: EPermission.ManageUserNotifications,
      actions: [EPermissionAction.Edit],
    },
  ])
  @UsePipes(CustomValidationPipe)
  @Patch('/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserNotificationDto,
  ): Promise<FullUserNotification> {
    const result = await this.userNotifsService.update(id, dto);
    return plainToClass(FullUserNotification, result);
  }

  @Permissions([
    {
      id: EPermission.ManageUserNotifications,
      actions: [EPermissionAction.Delete],
    },
  ])
  @UsePipes(CustomValidationPipe)
  @Post(userNotifEndpoint.delete.$part)
  async delete(@Body() dto: { ids: string[] }): Promise<boolean> {
    const result = await this.userNotifsService.delete(dto.ids);
    if (!result) {
      throw new AppError({
        message: 'An error ocurred while trying to delete',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    }
    return result;
  }
}
