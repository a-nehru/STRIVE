import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '@client-services/auth.service';
import { ToastrService } from 'ngx-toastr';

type TState = {
  errorMessage: string;
  forgotPwdFg: FormGroup;
};

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss'],
})
export class ForgotPasswordComponent implements OnInit {
  state: TState = {
    errorMessage: '',
    forgotPwdFg: new FormGroup({}),
  };

  constructor(
    private fb: FormBuilder,
    private service: AuthService,
    private toastrServ: ToastrService
  ) {}

  ngOnInit(): void {
    this.state.forgotPwdFg = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  async onSubmit(): Promise<void> {
    if (this.state.forgotPwdFg.invalid) {
      return;
    }

    try {
      const { email } = await this.service
        .callPasswordRecovery(this.state.forgotPwdFg.value.email)
        .toPromise();
      if (email) {
        this.state.forgotPwdFg.reset();
        this.toastrServ.info(
          'If the email exists, we will send you an email to recover your password',
          ''
        );
      }
    } catch (error: any) {
      if (error.status === 401) {
        this.state.errorMessage = 'Incorrect email';
      } else {
        this.state.errorMessage = error.error.message || error.statusText;
      }
    }
  }
}
