import { Component, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@client-services/auth.service';
import { CustomValidators } from 'src/app/validators/custom-validators';

type TState = {
  token: string;
  pwdRecoveryFg: FormGroup;
};

@Component({
  selector: 'app-password-recovery',
  templateUrl: './password-recovery.component.html',
  styleUrls: ['./password-recovery.component.scss'],
})
export class PasswordRecoveryComponent implements OnInit {
  state: TState = {
    token: '',
    pwdRecoveryFg: new FormGroup({}),
  };

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private service: AuthService,
    private route: ActivatedRoute
  ) {}

  async ngOnInit(): Promise<void> {
    this.state = {
      token: this.route.snapshot.queryParams.token,
      pwdRecoveryFg: this.fb.group({
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, CustomValidators.password()]],
        passwordCheck: ['', []], // Validators set later
      }),
    };
    const passwordCheck = this.state.pwdRecoveryFg.get('passwordCheck');
    passwordCheck?.setValidators([
      Validators.required,
      CustomValidators.mustMatchWithControl(
        this.state.pwdRecoveryFg.get('password') as AbstractControl
      ),
    ]);

    const recoveryRequest = await this.service
      .verifyPasswordRecoveryRequest(this.state.token)
      .toPromise();
    if (recoveryRequest) {
      const email = recoveryRequest.email;
      this.state.pwdRecoveryFg.setValue({
        email,
        password: '',
        passwordCheck: '',
      });
    }
  }

  async onSubmit(): Promise<void> {
    if (this.state.pwdRecoveryFg.invalid) {
      return;
    }

    const { success } = await this.service
      .applyPasswordRecovery(this.state.token, this.state.pwdRecoveryFg.value)
      .toPromise();
    if (success) {
      this.router.navigateByUrl('/login');
    }
  }
}
