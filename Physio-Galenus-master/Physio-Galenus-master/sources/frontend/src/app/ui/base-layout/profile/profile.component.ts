import { Component } from '@angular/core';
import { EPermission, EPermissionAction } from '@common/permissions';
import { stringsConfig } from '@config/strings.config';
import { ISidebarContent } from '../general-manager';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss'],
})
export class ProfileComponent {
  static readonly sidebarContent: ISidebarContent[] = [
    {
      icon: 'person',
      title: 'User',
      path: 'user',
      children: [
        {
          title: stringsConfig.sections.profile.user.myProfile.title,
          path: `/${stringsConfig.clientRoutes.profile}/user/${stringsConfig.sections.profile.user.myProfile.path}`,
          permissions: [
            {
              id: EPermission.SectionUserMyProfile,
              actions: [EPermissionAction.Read],
            },
          ],
        },
        {
          title: stringsConfig.sections.profile.user.resetPassword.title,
          path: `/${stringsConfig.clientRoutes.profile}/user/${stringsConfig.sections.profile.user.resetPassword.path}`,
          permissions: [
            {
              id: EPermission.SectionResetPassword,
              actions: [EPermissionAction.Read],
            },
          ],
        },
      ],
    },
    {
      icon: 'notifications',
      title: 'Notifications',
      path: 'notifications',
      children: [
        {
          title:
            stringsConfig.sections.profile.notifications.userNotifications
              .title,
          path: `/${stringsConfig.clientRoutes.profile}/notifications/${stringsConfig.sections.profile.notifications.userNotifications.path}`,
          permissions: [
            {
              id: EPermission.SectionUserNotifications,
              actions: [EPermissionAction.Read],
            },
          ],
        },
        {
          title:
            stringsConfig.sections.profile.notifications.removedNotifications
              .title,
          path: `/${stringsConfig.clientRoutes.profile}/notifications/${stringsConfig.sections.profile.notifications.removedNotifications.path}`,
          permissions: [
            {
              id: EPermission.SectionUserNotifications,
              actions: [EPermissionAction.Read],
            },
          ],
        },
      ],
    },
  ];

  constructor() {}
}
