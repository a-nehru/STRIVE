import {
  Controller,
  Post,
  UseGuards,
  UsePipes,
  Request,
  Req,
  Param,
  Get,
  Body,
} from '@nestjs/common';
import { plainToClass } from 'class-transformer';
import { authEndpoint } from '@config/endpoints.config';
import { FullPatientDto } from 'src/common/dto/response/full-patient.dto';
import { FullUserDto } from 'src/common/dto/response/full-user.dto';
import { DemoUserAllowed } from '@custom-decorators/demo-user-allowed.decorator';
import { CookieAuthenticationGuard } from 'src/guards/cookie-authentication.guard';
import { LogInWithCredentialsGuard } from 'src/guards/log-in-with-credentials.guard';
import { LogInWithTokenGuard } from 'src/guards/log-in-with-token.guard';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { AuthService } from './auth.service';
import { AppError } from '../errors/app-error.exception';
import { PasswordRecoveryCallDto } from '@common-request-dto/password-recovery-call.dto';
import { ApplyPasswordRecoveryDto } from '@common-request-dto/apply-password-recovery.dto';
import { ResetPasswordDto } from '@common-request-dto/reset-password.dto';

@Controller(authEndpoint.$full)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @DemoUserAllowed()
  @UseGuards(LogInWithCredentialsGuard)
  @Post(authEndpoint.login.$part)
  @UsePipes(CustomValidationPipe)
  async userLogin(@Request() { user }): Promise<FullUserDto> {
    return plainToClass(FullUserDto, user);
  }

  @UseGuards(LogInWithTokenGuard)
  @Post(authEndpoint.patientLogin.$part)
  @UsePipes(CustomValidationPipe)
  async patientLogin(@Request() { user }): Promise<FullPatientDto> {
    return plainToClass(FullPatientDto, user);
  }

  @Post(`${authEndpoint.verifyEmail.$part}/:token`)
  async verifyEmail(@Param('token') token: string): Promise<boolean> {
    return await this.authService.verifyEmail(token);
  }

  @Post(`${authEndpoint.callPasswordRecovery.$part}/:email`)
  @UsePipes(CustomValidationPipe)
  async requestPasswordRecovery(
    @Param('email') email: string,
  ): Promise<{ email: string }> {
    email = await this.authService.callPasswordRecovery(email);
    return { email };
  }

  @Get(`${authEndpoint.verifyPasswordRecovery.$part}/:token`)
  @UsePipes(CustomValidationPipe)
  async verifyPasswordRecovery(
    @Param('token') token: string,
  ): Promise<PasswordRecoveryCallDto> {
    const recoveryCall = await this.authService.verifyPasswordRecovery(token);
    if (!recoveryCall) {
      throw new AppError({ message: 'Invalid password recovery token' });
    }
    if (recoveryCall.expired_at < new Date()) {
      throw new AppError({ message: 'Expired password recovery token' });
    }
    return plainToClass(PasswordRecoveryCallDto, recoveryCall);
  }

  @Post(authEndpoint.resetPassword.$part)
  @UsePipes(CustomValidationPipe)
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<FullUserDto> {
    const updatedUser = await this.authService.resetPassword(resetPasswordDto);
    const fullUserDto = plainToClass(FullUserDto, updatedUser);
    return fullUserDto;
  }

  @Post(`${authEndpoint.applyPasswordRecovery.$part}/:token`)
  @UsePipes(CustomValidationPipe)
  async applyPasswordRecovery(
    @Param('token') token: string,
    @Body() body: ApplyPasswordRecoveryDto,
  ): Promise<{ success: boolean }> {
    if (!body.email) {
      throw new AppError({ message: 'Email not provided' });
    }
    if (!body.email || !body.password || body.password !== body.passwordCheck) {
      throw new AppError({ message: 'Passwords do not match' });
    }
    const recoveryRequest = await this.authService.verifyPasswordRecovery(
      token,
      body.email,
    );
    if (!recoveryRequest) {
      throw new AppError({ message: 'Invalid password recovery token' });
    }
    if (recoveryRequest.expired_at < new Date()) {
      throw new AppError({ message: 'Expired password recovery token' });
    }
    const success = await this.authService.applyPasswordRecovery(token, body);
    return { success };
  }

  @DemoUserAllowed()
  @UseGuards(CookieAuthenticationGuard)
  @Post(authEndpoint.logout.$part)
  async logout(@Req() req): Promise<boolean> {
    req.session.cookie.maxAge = 0;
    req.logout();
    return true;
  }
}
