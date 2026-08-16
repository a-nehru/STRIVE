import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { ErrorHandler, NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// ANGULAR MATERIAL COMPONENTS
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatTimepickerModule } from 'mat-timepicker';
import { MatDialogModule } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule } from '@angular/material/sort';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTreeModule } from '@angular/material/tree';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule, MatRippleModule } from '@angular/material/core';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { AppComponent } from './app.component';
import { AppModule } from './app.module';
import { apiEndpointInterceptorProvider } from './interceptors/api-endpoint.interceptor';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { BaseLayoutComponent } from './ui/base-layout/base-layout.component';
import { ToastrModule } from 'ngx-toastr';
import { LayoutModule } from '@angular/cdk/layout';
import { HeaderComponent } from './ui/layout/header/header.component';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { PagesLayoutComponent } from './ui/pages/pages-layout/pages-layout.component';
import { LoginComponent } from './ui/pages/pages-layout/login/login.component';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { GeneralManagerComponent } from './ui/base-layout/general-manager/general-manager.component';
import { RegisterPatientComponent } from './ui/base-layout/general-manager/register-patient/register-patient.component';
import { errorInterceptorProvider } from './interceptors/error.interceptor';
import { MyPatientsComponent } from './ui/base-layout/general-manager/my-patients/my-patients.component';
import { SignupComponent } from './ui/pages/pages-layout/signup/signup.component';
import { ExerciseScreenComponent } from './ui/base-layout/general-manager';

import { RoutineScreenComponent } from './ui/base-layout/general-manager/routine-screen/routine-screen.component';
import { RoutineAdjustDifficultyComponent } from './ui/base-layout/general-manager/routine-adjust-difficulty/routine-adjust-difficulty.component';
import { PaginationComponent } from './ui/components/pagination/pagination.component';
import { LoadingComponent } from './ui/components/loading/loading.component';

import { BasicModalInfoConfirmComponent } from './ui/base-layout/general-manager/elements/basic-modal-info-confirm/basic-modal-info-confirm.component';
import { TablePatientsComponent } from './ui/base-layout/general-manager/elements/table-patients/table-patients.component';
import { PatientProfileComponent } from './ui/base-layout/general-manager/patient-profile/patient-profile.component';

// DIRECTIVES
import { PermissionCheckDirective } from './directives/permission-check.directive';
import { PermissionsDisableDirective } from './directives/permission-disabled.directive';
import { GlobalErrorHandler } from '@client-services/global-error-handler.service';
import { MyProfileComponent } from './ui/base-layout/profile/my-profile/my-profile.component';
import { AdministrationComponent } from './ui/base-layout/administration/administration.component';
import { RolesComponent } from './ui/base-layout/administration/roles/roles.component';
import { UserPoliciesComponent } from './ui/base-layout/administration/user-policies/user-policies.component';
import { BasicDialogConfirmComponent } from './ui/components/basic-dialog-confirm/basic-dialog-confirm.component';
import { NgxChartsModule } from '@swimlane/ngx-charts';
import { MyRoutinesComponent } from './ui/base-layout/general-manager/my-routines/my-routines.component';
import { TableRoutinesComponent } from './ui/base-layout/general-manager/elements/table-routines/table-routines.component';
import { UserMenuComponent } from './ui/layout/header/elements/user-menu/user-menu.component';
import { PageHeadingComponent } from './ui/layout/page-heading/page-heading.component';
import { SideNavbarComponent } from './ui/layout/side-navbar/side-navbar.component';
import { DifficultyVariableDisplayComponent } from './ui/base-layout/general-manager/routine-adjust-difficulty/difficulty-variable-display/difficulty-variable-display.component';
import { DialogChangelogComponent } from './ui/components/dialog-changelog/dialog-changelog.component';
import { ForgotPasswordComponent } from './ui/pages/pages-layout/forgot-password/forgot-password.component';
import { PasswordRecoveryComponent } from './ui/pages/pages-layout/password-recovery/password-recovery.component';
import { TableNotificationsComponent } from './ui/base-layout/profile/elements/table-notifications/table-notifications.component';
import { UserNotificationsComponent } from './ui/base-layout/profile/user-notifications/user-notifications.component';
import { ProfileComponent } from './ui/base-layout/profile/profile.component';
import { ResetPasswordComponent } from './ui/base-layout/profile/reset-password/reset-password.component';
import { HelpMenuComponent } from './ui/layout/header/elements/help-menu/help-menu.component';
import { StoreModule } from '@ngrx/store';
import { StoreDevtoolsModule } from '@ngrx/store-devtools';
import { isProduction } from './utils/environment-utils';
import { EffectsModule } from '@ngrx/effects';
import { UserNotificationEffects } from './state/sections/user-notifications';
import { RemovedUserNotificationsComponent } from './ui/base-layout/profile/removed-user-notifications/removed-user-notifications.component';
import * as fromRoot from './state';
import { RemovedUserNotificationEffects } from './state/sections/removed-user-notifications';
import { ApiKeysComponent } from './ui/base-layout/administration/api-keys/api-keys.component';
import { DialogApiKeyComponent } from './ui/components/dialog-api-key/dialog-api-key.component';
import { FilterComponent } from './ui/components/filter/filter.component';
import { PricingComponent } from './ui/pages/pages-layout/pricing/pricing.component';
import { SafeHtmlPipe } from './pipes/safe-html.pipe';

@NgModule({
  declarations: [
    AppComponent,
    BaseLayoutComponent,
    HeaderComponent,
    PageHeadingComponent,
    HelpMenuComponent,
    UserMenuComponent,
    PagesLayoutComponent,
    SideNavbarComponent,
    GeneralManagerComponent,
    RegisterPatientComponent,
    ExerciseScreenComponent,
    ForgotPasswordComponent,
    PasswordRecoveryComponent,
    LoginComponent,
    MyPatientsComponent,
    SignupComponent,
    RoutineScreenComponent,
    RoutineAdjustDifficultyComponent,
    DifficultyVariableDisplayComponent,
    PatientProfileComponent,
    MyRoutinesComponent,
    PaginationComponent,
    LoadingComponent,
    BasicModalInfoConfirmComponent,
    TablePatientsComponent,
    TableRoutinesComponent,
    BasicDialogConfirmComponent,
    DialogChangelogComponent,
    DialogApiKeyComponent,
    FilterComponent,
    PricingComponent,

    // PIPES
    SafeHtmlPipe,

    // DIRECTIVES
    PermissionCheckDirective,
    PermissionsDisableDirective,

    // ADMINISTRATION
    AdministrationComponent,
    RolesComponent,
    UserPoliciesComponent,
    ApiKeysComponent,

    // PROFILE
    ProfileComponent,
    MyProfileComponent,
    TableNotificationsComponent,
    UserNotificationsComponent,
    RemovedUserNotificationsComponent,
    ResetPasswordComponent,
  ],
  imports: [
    ClipboardModule,
    BrowserAnimationsModule,
    FontAwesomeModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    CommonModule,

    // Angular Material
    MatSidenavModule,
    MatExpansionModule,
    MatButtonModule,
    MatNativeDateModule,
    MatRippleModule,
    MatAutocompleteModule,
    MatButtonToggleModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDatepickerModule,
    MatTimepickerModule,
    MatDialogModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatGridListModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatSidenavModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatSnackBarModule,
    MatSortModule,
    MatStepperModule,
    MatTableModule,
    MatTabsModule,
    MatToolbarModule,
    MatTooltipModule,
    MatTreeModule,
    MatBadgeModule,

    AppModule,
    ToastrModule.forRoot(),
    LayoutModule,
    NgbModule,
    NgxChartsModule,

    // NgRx
    EffectsModule.forRoot([
      RemovedUserNotificationEffects,
      UserNotificationEffects,
    ]),
    StoreModule.forRoot(fromRoot.reducers),
    StoreDevtoolsModule.instrument({
      maxAge: 25, // Retains last 25 states
      logOnly: isProduction(), // Restrict extension to log-only mode
      autoPause: true, // Pauses recording actions and state changes when the extension window is not open
    }),
  ],
  providers: [
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandler,
    },
    apiEndpointInterceptorProvider,
    errorInterceptorProvider,
  ],
  bootstrap: [AppComponent],
  entryComponents: [BasicModalInfoConfirmComponent],
})
export class AppBrowserModule {}
