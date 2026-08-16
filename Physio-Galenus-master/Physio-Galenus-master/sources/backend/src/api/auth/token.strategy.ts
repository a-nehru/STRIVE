import { HttpStatus, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AppError } from '../errors/app-error.exception';
import { AuthService } from './auth.service';

@Injectable()
export class TokenStrategy extends PassportStrategy(Strategy, 'token') {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'token', passwordField: 'token' });
  }

  async validate(username: string, password: string): Promise<any> {
    const user = await this.authService.validatePatient(password);
    if (!user) {
      throw new AppError({
        message: 'Auth validation error',
        statusCode: HttpStatus.UNAUTHORIZED,
      });
    }

    return user;
  }
}
