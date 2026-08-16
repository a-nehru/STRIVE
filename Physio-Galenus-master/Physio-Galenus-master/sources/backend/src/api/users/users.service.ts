import { UpdateUserDto } from '@common-request-dto/update-user.dto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { isDefined } from 'class-validator';
import {
  Permission,
  PricingPlan,
  Role,
  User,
  UserToPermission,
} from 'src/database/entity';
import { Connection, EntityManager, SelectQueryBuilder } from 'typeorm';
import { AppError } from '../errors/app-error.exception';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { PermissionDto } from 'src/common/dto/types/permission.dto';
import { CreateUserDto } from '@common-request-dto/create-user.dto';
import { SES } from 'aws-sdk';
import { envConfig } from '@config/environment.config';
import * as crypto from 'crypto';
import { EmailVerification } from 'src/database/entity/email-verification.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  private getUserQuery(em?: EntityManager): SelectQueryBuilder<User> {
    const manager = em ? em : this.connection.manager;
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.demo_patient', 'demo_patient')
      .leftJoinAndSelect('user.patients', 'patients')
      .leftJoinAndSelect('user.pricing_plan', 'pricing_plan');
  }

  private getFullUserQuery(em?: EntityManager): SelectQueryBuilder<User> {
    const manager = em ? em : this.connection.manager;
    return manager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.demo_patient', 'demo_patient')
      .leftJoinAndSelect('user.patients', 'patients')
      .leftJoinAndSelect('user.pricing_plan', 'pricing_plan')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.role_to_permissions', 'rtp')
      .leftJoinAndSelect('rtp.permission', 'rp')
      .leftJoinAndSelect('rp.permission_category', 'rpc')
      .leftJoinAndSelect('user.user_to_permissions', 'utp')
      .leftJoinAndSelect('utp.permission', 'up')
      .leftJoinAndSelect('up.permission_category', 'upc');
  }

  async createUser(dto: CreateUserDto): Promise<User> {
    const { manager } = this.connection;

    const createdUser = await manager.transaction(async (em) => {
      const user = em.create(User, {
        username: dto.username,
        password: dto.password,
      });

      if (isDefined(dto.pricingPlan)) {
        const pricingPlan = await em
          .getRepository(PricingPlan)
          .createQueryBuilder('pricingPlan')
          .where('pricingPlan.type = :pricingType', {
            pricingType: dto.pricingPlan,
          })
          .getOne();
        user.pricing_plan = pricingPlan;
      }

      // Add default therapist role
      const therapistRole = await em.getRepository(Role).findOne('THERAPIST');
      user.roles = [therapistRole];

      await em.save(User, user);

      if (!user.id) {
        throw new AppError({
          message: `Unknown error: user could not be created`,
        });
      }

      const emailVerification = em.create(EmailVerification, {
        email: user.username,
        token: crypto.randomBytes(16).toString('hex'),
        expired_at: new Date(),
      });
      await em.save(EmailVerification, emailVerification);
      if (
        !(await this.sendVerificationEmail(
          user.username,
          emailVerification.token,
        ))
      ) {
        throw new AppError({
          message: `Unknown error: something was wrong sending the email verification`,
        });
      }

      return user;
    });

    return createdUser;
  }

  async updateUser(dto: UpdateUserDto, id: string): Promise<User> {
    const { manager } = this.connection;

    return await manager.transaction(async (em) => {
      const user = await this.getUserQuery(em)
        .where('user.id = :id', { id })
        .getOne();
      if (!user) {
        throw new AppError({
          message: `No user data was found for ID ${id}`,
        });
      }

      if (isDefined(dto.pricingPlan)) {
        const pricingPlan = await em
          .getRepository(PricingPlan)
          .createQueryBuilder('pricingPlan')
          .where('pricingPlan.type = :pricingType', {
            pricingType: dto.pricingPlan,
          })
          .getOne();
        user.pricing_plan = pricingPlan;
      }

      return await em.getRepository(User).save(user);
    });
  }

  async deleteUser(id: string): Promise<string> {
    const { manager } = this.connection;

    const user = await this.getUserQuery(manager)
      .where('user.id = :id', { id })
      .getOne();

    if (!user) {
      throw new AppError({ message: `No user data was found for ID ${id}` });
    }

    await manager.getRepository(User).delete({ id: user.id });
    return user.id;
  }

  async getUser(id: string): Promise<User> {
    const user = await this.getUserQuery()
      .where('user.id = :id', { id })
      .getOne();
    if (!user) {
      throw new AppError({ message: `No user data was found for ID ${id}` });
    }

    return user;
  }

  async getFullUser(id: string): Promise<User> {
    const user = await this.getFullUserQuery()
      .where('user.id = :id', { id })
      .getOne();
    if (!user) {
      throw new AppError({ message: `No user data was found for ID ${id}` });
    }

    return user;
  }

  async updateRoles(userId: string, roleIds: string[]): Promise<User> {
    const { manager } = this.connection;
    // Get all the roles entities from the input roles IDs
    const roles: Role[] = await manager
      .getRepository(Role)
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.role_to_permissions', 'rtp')
      .leftJoinAndSelect('rtp.permission', 'rp')
      .leftJoinAndSelect('rp.permission_category', 'rpc')
      .whereInIds(roleIds)
      .getMany();

    const query = manager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role');
    const user = await query.where('user.id = :userId', { userId }).getOne();
    if (!user) {
      throw new AppError({ message: `User ID (${userId}) not found` });
    }

    user.roles = roles;
    if (!(await manager.getRepository(User).save(user))) {
      throw new AppError({
        message: `Roles for user ${userId} could not been updated`,
      });
    }
    const updatedUser = await this.getFullUserQuery()
      .where('user.id = :userId', { userId })
      .getOne();
    return updatedUser;
  }

  async upsertUserPermissions(
    userId: string,
    permissions: PermissionDto[],
  ): Promise<void> {
    const { manager } = this.connection;
    return await manager.transaction(async (em) => {
      const user = await em
        .getRepository(User)
        .createQueryBuilder('user')
        .where('user.id = :userId', { userId })
        .getOne();
      if (!user) {
        throw new AppError({ message: `User ${userId} not found` });
      }
      const permissionsQuery = em
        .getRepository(Permission)
        .createQueryBuilder('permission')
        .leftJoinAndSelect('permission.permission_category', 'pc');

      for (const p of permissions) {
        const pBD = await permissionsQuery
          .clone()
          .where('permission.id = :id', { id: p.id })
          .getOne();
        if (!pBD) {
          this.logger.warn(
            `Permission ${p.id} not found in the database; ignoring...`,
          );
          continue;
        }
        const upsertUTP = em.create(UserToPermission, {
          user_id: userId,
          permission_id: p.id,
          can_create: p.can_create,
          can_edit: p.can_edit,
          can_read: p.can_read,
          can_delete: p.can_delete,
          can_list: p.can_list,
        });
        em.getRepository(UserToPermission).save(upsertUTP);
      }
    });
  }

  async deleteUserPermissions(
    user_id: string,
    permissionIds: string[],
  ): Promise<void> {
    let deletedPermissions = 0;
    const { manager } = this.connection;
    return await manager.transaction(async (em) => {
      for (const permission_id of permissionIds) {
        const foundPermission = await em
          .getRepository(UserToPermission)
          .createQueryBuilder('user_to_permission')
          .where('user_to_permission.user_id = :user_id', { user_id })
          .andWhere('user_to_permission.permission_id = :permission_id', {
            permission_id,
          });
        if (!foundPermission) {
          this.logger.warn(
            `Permission ${permission_id} could not be removed because it wasn't even assigned for the user ${user_id}; ignoring...`,
          );
          continue;
        }
        const deleteResult = await manager
          .getRepository(UserToPermission)
          .delete({ user_id, permission_id });
        if (deleteResult.affected <= 0) {
          throw new AppError({
            message: `Permission ${permission_id} could not be deleted from the database`,
            additionalData: {
              deleteResult,
            },
          });
        }
        deletedPermissions++;
      }

      if (deletedPermissions <= 0) {
        throw new AppError({
          message: `No permissions could be removed for user ${user_id}`,
          additionalData: {
            permissionsToBeRemoved: permissionIds,
          },
        });
      }
    });
  }

  private async sendVerificationEmail(
    email: string,
    token: string,
  ): Promise<boolean> {
    const link = `${envConfig.host.url}/signup?token=${token}`;
    const result = await new SES(envConfig.aws.emailSender.config)
      .sendEmail({
        Source: envConfig.aws.emailSender.originationAddress,
        Destination: {
          ToAddresses: [email],
        },
        ReplyToAddresses: [envConfig.aws.emailSender.originationAddress],
        Message: {
          Subject: {
            Charset: 'UTF-8',
            Data: 'Welcome to Physio Galenus',
          },
          Body: {
            Html: {
              Charset: 'UTF-8',
              Data:
                `Hi,<br><br>` +
                `Welcome to <strong>Physio Galenus</strong>! Click below to verify your email address.<br><br>` +
                `<a href="${link}">Confirm email</a><br><br>` +
                'Thank you.',
            },
          },
        },
      })
      .promise();

    return !!result.MessageId;
  }
}
