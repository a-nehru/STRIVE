import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@client-services/auth.service';

type TState = {
  hidePwd: boolean;
  returnUrl: string;
  errorMessage: string;
  loginForm: FormGroup;
};

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent implements OnInit {
  state: TState = {
    hidePwd: true,
    returnUrl: '',
    errorMessage: '',
    loginForm: new FormGroup({}),
  };

  constructor(
    readonly authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.state.loginForm = this.fb.group({
      username: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });

    this.state.returnUrl = this.route.snapshot.queryParams.returnUrl || '/';
  }

  async onSubmit(): Promise<void> {
    if (this.state.loginForm.invalid) {
      return;
    }

    try {
      await this.authService
        .login(
          this.state.loginForm.get('username')?.value,
          this.state.loginForm.get('password')?.value
        )
        .toPromise();
    } catch (error: any) {
      if (error.status === 401) {
        this.state.errorMessage = 'Incorrect email or password';
      } else {
        this.state.errorMessage = error.error.message || error.statusText;
      }
    }
    this.router.navigate([this.state.returnUrl]);
  }
}
