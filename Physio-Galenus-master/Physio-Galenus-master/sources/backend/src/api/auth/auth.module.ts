import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { UsersModule } from '../users/users.module';
import { ApiKeyStrategy } from './api-key.strategy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalStrategy } from './local.strategy';
import { SessionSerializer } from './session.serializer';
import { TokenStrategy } from './token.strategy';

@Module({
  imports: [
    UsersModule,
    ApiKeysModule,
    PassportModule.register({ defaultStrategy: 'local', session: true }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    SessionSerializer,
    TokenStrategy,
    ApiKeyStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
