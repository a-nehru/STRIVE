import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@client-services/auth.service';
import { ConfirmDialogService } from '@client-services/confirm-dialog.service';
import { UsersService } from '@client-services/users.service';
import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { CustomValidators } from 'src/app/validators/custom-validators';

type TState = {
  isLoading: boolean;
  submitted: boolean;
  returnUrl: string;
  signUpForm: FormGroup;
  subscription: Subscription;
};

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss'],
})
export class SignupComponent implements OnInit {
  state: TState = {
    isLoading: false,
    submitted: false,
    returnUrl: '',
    signUpForm: new FormGroup({}),
    subscription: new Subscription(),
  };

  imports = {
    EPricingPlanType,
  };

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private usersService: UsersService,
    private authService: AuthService,
    private toastrService: ToastrService,
    private confirmDialogService: ConfirmDialogService
  ) {}

  ngOnInit(): void {
    this.state.signUpForm = this.fb.group({
      username: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, CustomValidators.password()]],
      validatePassword: [''],
      pricingPlanType: ['', Validators.required], // Validators set later
    });
    this.state.returnUrl = this.route.snapshot.queryParams.returnUrl || '/';

    const validatePassword = this.state.signUpForm.get('validatePassword');
    validatePassword?.setValidators([
      Validators.required,
      CustomValidators.mustMatchWithControl(
        this.state.signUpForm.get('password') as AbstractControl
      ),
    ]);

    // This code is only run when verification email is asked
    const encryptedToken = this.route.snapshot.queryParamMap.get('token');
    if (encryptedToken) {
      this.verifyEmail(encryptedToken);
    }
  }

  async onSubmit(): Promise<void> {
    this.state.submitted = true;
    if (this.state.signUpForm.invalid) {
      return;
    }

    this.state.subscription.add(
      this.usersService
        .create({
          username: this.state.signUpForm.get('username')?.value,
          password: this.state.signUpForm.get('password')?.value,
          pricingPlan: this.state.signUpForm.get('pricingPlanType')?.value,
        })
        .subscribe(async (result) => {
          if (result) {
            await this.confirmDialogService.confirm(
              'Sign up successfully completed!',
              `Thank you for registering into Physio Galenus.\n
              Before log in, please verify your identity using the email we have sent to you`,
              {
                cancelButtonTitle: '',
                acceptButtonTitle: 'Accept',
                showModalCross: false,
              },
              true
            );
            this.router.navigate([this.state.returnUrl]);
          }
        })
    );
  }

  private verifyEmail(encryptedToken: string): void {
    this.state.isLoading = true;
    this.authService
      .verifyEmail(encryptedToken)
      .subscribe(async (isVerified: boolean) => {
        if (isVerified) {
          if (
            await this.confirmDialogService.confirm(
              'Account activated!',
              'You can now log in into Physio Galenus',
              {
                cancelButtonTitle: 'Cancel',
                acceptButtonTitle: 'Accept',
                showModalCross: true,
              },
              true
            )
          ) {
            this.router.navigateByUrl('/login');
          }
        } else {
          this.toastrService.error(
            'Error when trying to verify your email',
            'Email verification failed'
          );
        }
      })
      .add(() => (this.state.isLoading = false));
  }

  ngOnDestroy(): void {
    this.state.subscription.unsubscribe();
  }
}
