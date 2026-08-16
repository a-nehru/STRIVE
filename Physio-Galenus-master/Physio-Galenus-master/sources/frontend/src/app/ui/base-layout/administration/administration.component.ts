import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { stringsConfig } from '@config/strings.config';
import { EPermission, EPermissionAction } from '@common/permissions';
import { ISidebarContent } from '../general-manager';

@Component({
  selector: 'app-administration',
  templateUrl: './administration.component.html',
  styleUrls: ['./administration.component.scss'],
})
export class AdministrationComponent {
  static readonly sidebarContent: ISidebarContent[] = [
    {
      icon: 'security',
      title: 'Policies',
      path: 'policies',
      children: [
        {
          title: stringsConfig.sections.admin.policies.users.title,
          path: `/${stringsConfig.clientRoutes.admin}/policies/${stringsConfig.sections.admin.policies.users.path}`,
          permissions: [
            {
              id: EPermission.SectionUserPolicies,
              actions: [EPermissionAction.Read],
            },
          ],
        },
        {
          title: stringsConfig.sections.admin.policies.roles.title,
          path: `/${stringsConfig.clientRoutes.admin}/policies/${stringsConfig.sections.admin.policies.roles.path}`,
          permissions: [
            { id: EPermission.SectionRoles, actions: [EPermissionAction.Read] },
          ],
        },
        {
          title: stringsConfig.sections.admin.policies.apiKeys.title,
          path: `/${stringsConfig.clientRoutes.admin}/policies/${stringsConfig.sections.admin.policies.apiKeys.path}`,
          permissions: [
            {
              id: EPermission.SectionPoliciesApiKeys,
              actions: [EPermissionAction.Read],
            },
          ],
        },
      ],
    },
  ];

  constructor(public router: Router) {}
}
