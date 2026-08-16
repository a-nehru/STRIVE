import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { AuthService } from '@client-services/auth.service';
import { PatientsService } from '@client-services/patients.service';
import { filter, switchMap, tap } from 'rxjs/operators';
import { isDefined } from '@common/utils/is-defined';
import { UsersService } from '@client-services/users.service';
import { appConfig } from '@config/app.config';
import { FullUserDto } from '@common-response-dto/full-user.dto';
import { CustomValidators } from 'src/app/validators/custom-validators';
import { BasicModalInfoConfirmComponent } from '../../general-manager/elements/basic-modal-info-confirm/basic-modal-info-confirm.component';

type TState = {
  heading: string;
  subheading: string;
  headingIcon: string;
  isLoading: boolean;
  editing: boolean;
  userForm: FormGroup;
  subscription: Subscription;
  user: FullUserDto | undefined;
};

@Component({
  selector: 'app-my-profile',
  templateUrl: './my-profile.component.html',
  styleUrls: ['./my-profile.component.scss'],
  entryComponents: [BasicModalInfoConfirmComponent],
})
export class MyProfileComponent implements OnInit {
  state: TState = {
    heading: 'My Profile',
    subheading: 'This is the data of your account',
    headingIcon: 'account_box',
    isLoading: false,
    editing: false,
    user: undefined,
    userForm: new FormGroup({}),
    subscription: new Subscription(),
  };

  imports = {
    Object,
    EPricingPlanType,
  };

  get isDemo(): boolean {
    return !!this.authService.userSubject.value?.is_demo;
  }

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private authService: AuthService,
    private usersService: UsersService,
    private patientsService: PatientsService
  ) {}

  ngOnInit(): void {
    this.state.userForm = this.fb.group({
      username: [{ value: '', disabled: true }, [Validators.required]],
      pricingPlanType: ['', [Validators.required]],
      token: [{ value: '', disabled: true }, []],
    });

    this.state.subscription.add(
      this.usersService
        .fetch(this.authService.userSubject.value.id)
        .pipe(
          tap(
            // Load user data
            (user) => {
              this.state.user = user;
              this.restoreFormData();
            },
            (error) => {
              this.toastr.error(error.error.message || error.statusText);
            }
          ),
          filter((user) => isDefined(user?.demo_patient_id)),
          switchMap((user) =>
            this.patientsService.fetch(user.demo_patient_id || '')
          )
        )
        .subscribe(
          (demoPatient) => {
            // Load access token
            this.state.userForm.patchValue({ token: demoPatient.access_token });
          },
          (error) => {
            this.toastr.error(error.error.message || error.statusText);
          }
        )
        .add(async () => {
          await new Promise((f) =>
            setTimeout(f, appConfig.minimumLoadTimeInMs)
          );
          this.state.isLoading = false;
        })
    );
  }

  async onSubmit(): Promise<void> {
    if (this.state.userForm.invalid) {
      this.toastr.error('There are invalid fields');
      return;
    }

    this.state.isLoading = true;

    if (this.state.user) {
      this.state.subscription.add(
        this.usersService
          .update(this.state.user.id, {
            username: this.state.userForm.get('username')?.value,
            pricingPlan: this.state.userForm.get('pricingPlanType')?.value,
          })
          .subscribe(
            (user) => {
              this.state.user = user;
              this.restoreFormData();
            },
            (error) => {
              this.toastr.error(error.error.message || error.statusText);
            }
          )
          .add(async () => {
            await new Promise((f) =>
              setTimeout(f, appConfig.minimumLoadTimeInMs)
            );
            this.state.isLoading = false;
          })
      );
    }
  }

  restoreFormData(): void {
    this.state.userForm.patchValue({
      username: this.state.user?.username,
      pricingPlanType: this.state.user?.pricing_plan,
      password: '',
      confirmPassword: '',
    });
    this.state.editing = false;
  }
}
