import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { Patient, User } from 'src/database/entity';
import { Connection } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PasswordRecoveryCall } from 'src/database/entity/password-recovery-call.entity';
import { envConfig } from '@config/environment.config';
import { SES } from 'aws-sdk';
import { ApplyPasswordRecoveryDto } from '@common-request-dto/apply-password-recovery.dto';
import { EmailVerification } from 'src/database/entity/email-verification.entity';
import { AppError } from '../errors/app-error.exception';
import { compareAsc } from 'date-fns';
import { ResetPasswordDto } from '@common-request-dto/reset-password.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    private readonly usersService: UsersService,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.findFullUser(username);

    if (!user || !user.is_activated) {
      return null;
    }

    const passwordsAreEqual = await this.passwordsAreEqual(
      password,
      user.password,
    );
    if (!passwordsAreEqual) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...result } = user;

    // Demo user data merge: use test user's data with demo user's permissions
    if (result.is_demo && result.demo_data_source) {
      const dataSourceUser = await this.findFullUser(
        result.demo_data_source.username,
      );
      if (dataSourceUser) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _, ...dataSourceResult } = dataSourceUser;
        return {
          // From data source user: id, data, patients, pricing, etc.
          id: dataSourceResult.id,
          demo_patient: dataSourceResult.demo_patient,
          patients: dataSourceResult.patients,
          pricing_plan: dataSourceResult.pricing_plan,
          is_activated: dataSourceResult.is_activated,
          audit_dates: dataSourceResult.audit_dates,
          // From demo user: permissions (DEMO_THERAPIST role)
          roles: result.roles,
          user_to_permissions: result.user_to_permissions,
          // Keep demo user identity
          username: result.username,
          is_demo: true,
        };
      }
    }

    return result;
  }

  private async findFullUser(username: string): Promise<User | undefined> {
    const { manager } = this.connection;

    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.pricing_plan', 'pricing_plan')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.role_to_permissions', 'rtp')
      .leftJoinAndSelect('rtp.permission', 'rp')
      .leftJoinAndSelect('rp.permission_category', 'rpc')
      .leftJoinAndSelect('user.user_to_permissions', 'utp')
      .leftJoinAndSelect('utp.permission', 'up')
      .leftJoinAndSelect('up.permission_category', 'upc')
      .leftJoinAndSelect('user.demo_data_source', 'demo_data_source')
      .where('user.username = :usernameToCheck', { usernameToCheck: username })
      .getOne();
  }

  async validatePatient(token: string): Promise<any> {
    const { manager } = this.connection;

    const user = await manager
      .getRepository(Patient)
      .createQueryBuilder('patient')
      .where('patient.access_token = :accessTokenToCheck', {
        accessTokenToCheck: token,
      })
      .getOne();

    if (!user) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { access_token: _, ...result } = user;
    return result;
  }

  async verifyEmail(token: string): Promise<boolean> {
    const { manager } = this.connection;

    const emailVerification = await manager.findOne(EmailVerification, {
      where: { token },
    });
    if (!emailVerification || !emailVerification.email) {
      throw new AppError({ message: 'Verification email token not found' });
    }

    if (compareAsc(new Date(), emailVerification.expired_at) === 1) {
      throw new AppError({
        message: 'Email verification has expired. Please, register again.',
      });
    }

    await manager.update(
      User,
      { username: emailVerification.email },
      { is_activated: true },
    );

    // Delete the email verification entity
    const deleted = await manager.delete(EmailVerification, {
      email: emailVerification.email,
    });

    return deleted.affected > 0;
  }

  async callPasswordRecovery(email: string): Promise<string> {
    const { manager } = this.connection;
    const user = await manager.findOne(User, { username: email });
    // If user not exist, we didn't send an email
    if (!user) {
      return email;
    }

    const req = manager.create(PasswordRecoveryCall, {
      email,
      token: crypto.randomBytes(16).toString('hex'),
      audit_dates: {
        created_at: new Date(),
      },
    });
    await manager.save(PasswordRecoveryCall, req);
    const link = `${envConfig.host.url}/password-recovery?token=${req.token}`;
    const body = `
      Hi!

      We have received a password recovery request for the user registered with this email address.

      If you have not requested this, just ignore this email. Otherwise, click on the link below or open it in
      your web browser to create a new password:

      <a href="${link}">Click here to recover your password</a>

      Kind regards.
    `;
    await this.sendEmail(email, 'Password recovery request', body);
    return email;
  }

  async verifyPasswordRecovery(
    token: string,
    email?: string,
  ): Promise<PasswordRecoveryCall> {
    const { manager } = this.connection;
    return manager.findOne(PasswordRecoveryCall, { where: { token } });
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<User> {
    const { manager } = this.connection;

    const { username, currentPassword, newPassword } = resetPasswordDto;
    const user = await manager
      .createQueryBuilder(User, 'user')
      .where('user.username = :username', { username })
      .getOne();
    if (!user) {
      throw new AppError({ message: `Username (${username}) not found` });
    }

    const passwordsAreEqual = await this.passwordsAreEqual(
      currentPassword,
      user.password,
    );
    if (!passwordsAreEqual) {
      throw new AppError({
        message: `The password provided does not exist for ${username}`,
      });
    }

    if (await this.isPasswordReused(newPassword, user.passwords_history)) {
      throw new AppError({
        message: 'You cannot reuse old passwords; please enter a new one',
      });
    }

    user.password = newPassword;
    user.last_password_updated_date = new Date();
    user.is_password_recovery_notified = false;
    user.is_password_expiration_notified = false;
    if (!(await manager.save(User, user))) {
      throw new AppError({
        message: `Something was wrong resetting the password`,
      });
    }

    return await this.usersService.getFullUser(user.id);
  }

  async applyPasswordRecovery(
    token: string,
    data: ApplyPasswordRecoveryDto,
  ): Promise<boolean> {
    const { manager } = this.connection;
    const recoveryRequest = await manager.findOne(PasswordRecoveryCall, {
      token,
    });
    if (!recoveryRequest) {
      return false;
    }
    const user = await manager
      .createQueryBuilder(User, 'user')
      .where('user.username = :username', { username: data.email })
      .getOne();
    if (!user) {
      return false;
    }

    const newPassword = data.password;
    if (await this.isPasswordReused(newPassword, user.passwords_history)) {
      throw new AppError({
        message: 'You cannot reuse old passwords; please enter a new one',
      });
    }

    user.password = newPassword;
    user.last_password_updated_date = new Date();
    user.is_password_recovery_notified = false;
    user.is_password_expiration_notified = false;

    if (!(await manager.save(User, user))) {
      throw new AppError({
        message: `Something was wrong recovering the password`,
      });
    }
    const link = `${envConfig.host.url}/login`;
    const body = `
      Hi!

      Your password has been changed successfully. Now you can use it to login.

      <a href="${link}">Click here to log in</a>

      Kind regards.
    `;
    await this.sendEmail(data.email, 'Password changed', body);
    await manager.getRepository(PasswordRecoveryCall).remove(recoveryRequest);
    return true;
  }

  private async sendEmail(
    email: string,
    subject: string,
    body: string,
  ): Promise<void> {
    await new SES(envConfig.aws.emailSender.config)
      .sendEmail({
        Source: envConfig.aws.emailSender.originationAddress,
        Destination: { ToAddresses: [email] },
        ReplyToAddresses: [envConfig.aws.emailSender.originationAddress],
        Message: {
          Subject: { Charset: 'UTF-8', Data: subject },
          Body: {
            Html: { Charset: 'UTF-8', Data: body.replace(/\n/g, '<br/>') },
          },
        },
      })
      .promise();
  }

  private async isPasswordReused(
    plainPassword: string,
    passwords_history: string[],
  ): Promise<boolean> {
    if (!passwords_history) {
      return false;
    }

    for (const passwordHistory of passwords_history) {
      if (await this.passwordsAreEqual(plainPassword, passwordHistory)) {
        return true;
      }
    }
    return false;
  }

  private async passwordsAreEqual(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }
}
