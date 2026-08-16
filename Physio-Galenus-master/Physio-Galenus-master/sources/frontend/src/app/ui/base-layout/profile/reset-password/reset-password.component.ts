import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { AuthService } from '@client-services/auth.service';
import { ToastrService } from 'ngx-toastr';
import { CustomValidators } from 'src/app/validators/custom-validators';

type TState = {
  isLoading: boolean;
  heading: string;
  subheading: string;
  headingIcon: string;
  pwdResetFg: FormGroup;
};

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
})
export class ResetPasswordComponent implements OnInit {
  state: TState = {
    isLoading: false,
    heading: 'Reset Password',
    subheading: 'Change the password of your account',
    headingIcon: 'lock',
    pwdResetFg: new FormGroup({}),
  };

  constructor(
    private fb: FormBuilder,
    private toastrService: ToastrService,
    private service: AuthService
  ) {}

  ngOnInit(): void {
    this.state = {
      ...this.state,
      pwdResetFg: this.fb.group({
        currentPassword: ['', [Validators.required, Validators.minLength(6)]],
        newPassword: ['', [Validators.required, CustomValidators.password()]],
        passwordCheck: ['', []], // Validators set later
      }),
    };
    const passwordCheck = this.state.pwdResetFg.get('passwordCheck');
    passwordCheck?.setValidators([
      Validators.required,
      CustomValidators.mustMatchWithControl(
        this.state.pwdResetFg.get('newPassword') as AbstractControl
      ),
    ]);
  }

  onSubmit(): void {
    if (this.state.pwdResetFg.invalid) {
      return;
    }

    this.state.isLoading = true;
    this.service
      .resetPassword({
        username: this.service.userSubject.value.username,
        currentPassword: this.state.pwdResetFg.get('currentPassword')?.value,
        newPassword: this.state.pwdResetFg.get('newPassword')?.value,
      })
      .subscribe((newUserDto) => {
        this.service.userSubject.next(newUserDto);
        this.toastrService.success(
          'Password was successfully updated',
          'Reset password'
        );
      })
      .add(() => (this.state.isLoading = false));
  }
}
