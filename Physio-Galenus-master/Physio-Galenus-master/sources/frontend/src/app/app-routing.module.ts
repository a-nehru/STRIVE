import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { stringsConfig } from '@config/strings.config';
import { EPermission, EPermissionAction } from '@common/permissions';
import { AuthGuard } from './guards/auth.guard';
import { AdministrationComponent } from './ui/base-layout/administration/administration.component';
import { RolesComponent } from './ui/base-layout/administration/roles/roles.component';
import { UserPoliciesComponent } from './ui/base-layout/administration/user-policies/user-policies.component';
import { BaseLayoutComponent } from './ui/base-layout/base-layout.component';
import {
  ExerciseScreenComponent,
  RoutineScreenComponent,
  RoutineAdjustDifficultyComponent,
  GeneralManagerComponent,
  RegisterPatientComponent,
} from './ui/base-layout/general-manager';
import { MyPatientsComponent } from './ui/base-layout/general-manager/my-patients/my-patients.component';
import { PatientProfileComponent } from './ui/base-layout/general-manager/patient-profile/patient-profile.component';
import { MyProfileComponent } from './ui/base-layout/profile/my-profile/my-profile.component';
import { LoginComponent } from './ui/pages/pages-layout/login/login.component';
import { PagesLayoutComponent } from './ui/pages/pages-layout/pages-layout.component';
import { SignupComponent } from './ui/pages/pages-layout/signup/signup.component';
import { MyRoutinesComponent } from './ui/base-layout/general-manager/my-routines/my-routines.component';
import { ForgotPasswordComponent } from './ui/pages/pages-layout/forgot-password/forgot-password.component';
import { PasswordRecoveryComponent } from './ui/pages/pages-layout/password-recovery/password-recovery.component';
import { ProfileComponent } from './ui/base-layout/profile/profile.component';
import { UserNotificationsComponent } from './ui/base-layout/profile/user-notifications/user-notifications.component';
import { ResetPasswordComponent } from './ui/base-layout/profile/reset-password/reset-password.component';
import { RemovedUserNotificationsComponent } from './ui/base-layout/profile/removed-user-notifications/removed-user-notifications.component';
import { ApiKeysComponent } from './ui/base-layout/administration/api-keys/api-keys.component';
import { PricingComponent } from './ui/pages/pages-layout/pricing/pricing.component';

const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: `/${stringsConfig.clientRoutes.generalManager}`,
  },
  {
    path: '',
    component: PagesLayoutComponent,
    children: [
      {
        path: 'login',
        component: LoginComponent,
        data: { extraParameter: '' },
      },
      {
        path: 'forgot-password',
        component: ForgotPasswordComponent,
        data: { extraParameter: '' },
      },
      {
        path: 'password-recovery',
        component: PasswordRecoveryComponent,
        data: { extraParameter: '' },
      },
      {
        path: 'signup',
        component: SignupComponent,
        data: { extraParameter: '' },
      },
      {
        path: 'pricing',
        component: PricingComponent,
        data: { extraParameter: '' },
      },
    ],
  },
  {
    path: '',
    component: BaseLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: stringsConfig.clientRoutes.generalManager,
        component: GeneralManagerComponent,
        data: {
          extraParameter: 'clients',
          sidebarContent: GeneralManagerComponent.sidebarContent,
        },
        children: [
          {
            path: stringsConfig.sections.generalManager.patients.myPatients
              .path,
            component: MyPatientsComponent,
            canActivate: [AuthGuard],
            data: {
              permissions: [
                {
                  id: EPermission.SectionPatientsMyPatients,
                  actions: [EPermissionAction.Read],
                },
              ],
            },
          },
          {
            path: stringsConfig.sections.generalManager.patients.registerPatient
              .path,
            component: RegisterPatientComponent,
            canActivate: [AuthGuard],
            data: {
              permissions: [
                {
                  id: EPermission.SectionPatientsAddPatient,
                  actions: [EPermissionAction.Read],
                },
              ],
            },
          },
          {
            path: stringsConfig.sections.generalManager.patients.path,
            children: [
              {
                path: stringsConfig.sections.generalManager.patients
                  .patientProfile.path,
                component: PatientProfileComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionPatientsPatientProfile,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
            ],
          },
          {
            path: stringsConfig.sections.generalManager.exercises.path,
            children: [
              {
                path: stringsConfig.sections.generalManager.exercises
                  .exerciseScreen.path,
                component: ExerciseScreenComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionExercisesDetails,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
            ],
          },
          {
            path: stringsConfig.sections.generalManager.routines.path,
            children: [
              {
                path: stringsConfig.sections.generalManager.routines
                  .routineScreen.path,
                component: RoutineScreenComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionRoutinesAddRoutine,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
              {
                path: stringsConfig.sections.generalManager.routines
                  .routineDetails.path,
                component: RoutineScreenComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionRoutinesDetails,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
              {
                path: stringsConfig.sections.generalManager.routines
                  .routineAdjustDifficulty.path,
                component: RoutineAdjustDifficultyComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionRoutinesAdjustDifficulty,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
              {
                path: stringsConfig.sections.generalManager.routines.myRoutines
                  .path,
                component: MyRoutinesComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionRoutinesMyRoutines,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      {
        path: stringsConfig.clientRoutes.admin,
        component: AdministrationComponent,
        data: {
          extraParameter: '',
          sidebarContent: AdministrationComponent.sidebarContent,
        },
        children: [
          {
            path: '',
            redirectTo: 'policies',
            pathMatch: 'full',
          },
          {
            path: 'policies',
            children: [
              {
                path: '',
                redirectTo: stringsConfig.sections.admin.policies.users.path,
                pathMatch: 'full',
              },
              {
                path: stringsConfig.sections.admin.policies.users.path,
                component: UserPoliciesComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionUserPolicies,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
              {
                path: stringsConfig.sections.admin.policies.roles.path,
                component: RolesComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionRoles,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
              {
                path: stringsConfig.sections.admin.policies.apiKeys.path,
                component: ApiKeysComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionPoliciesApiKeys,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      {
        path: stringsConfig.clientRoutes.profile,
        component: ProfileComponent,
        data: {
          extraParameter: '',
          sidebarContent: ProfileComponent.sidebarContent,
        },
        children: [
          {
            path: 'user',
            children: [
              {
                path: '',
                redirectTo: stringsConfig.sections.profile.user.myProfile.path,
                pathMatch: 'full',
              },
              {
                path: stringsConfig.sections.profile.user.myProfile.path,
                component: MyProfileComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionUserMyProfile,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
              {
                path: stringsConfig.sections.profile.user.resetPassword.path,
                component: ResetPasswordComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionResetPassword,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
            ],
          },
          {
            path: 'notifications',
            children: [
              {
                path: '',
                redirectTo:
                  stringsConfig.sections.profile.notifications.userNotifications
                    .path,
                pathMatch: 'full',
              },
              {
                path: stringsConfig.sections.profile.notifications
                  .userNotifications.path,
                component: UserNotificationsComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionUserNotifications,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
              {
                path: stringsConfig.sections.profile.notifications
                  .removedNotifications.path,
                component: RemovedUserNotificationsComponent,
                canActivate: [AuthGuard],
                data: {
                  permissions: [
                    {
                      id: EPermission.SectionUserNotifications,
                      actions: [EPermissionAction.Read],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: `/${stringsConfig.clientRoutes.generalManager}` },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      scrollPositionRestoration: 'enabled',
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
