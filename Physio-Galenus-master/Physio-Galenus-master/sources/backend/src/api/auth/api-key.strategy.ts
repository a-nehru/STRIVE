import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ApiKeysService } from '../api-keys/api-keys.service';
import Strategy from 'passport-headerapikey';
import { plainToClass } from 'class-transformer';
import { FullUserDto } from '../../common/dto/response/full-user.dto';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor(private readonly apiKeysService: ApiKeysService) {
    super(
      { header: 'X-API-Key', prefix: '' },
      true,
      async (
        apiKey: string,
        done: (error: Error, data: FullUserDto) => void,
      ) => {
        return this.validate(apiKey, done);
      },
    );
  }

  async validate(
    key: string,
    done: (error: Error, data: FullUserDto) => void,
  ): Promise<void> {
    const apiKey = await this.apiKeysService.get({ where: 'key', key });
    if (apiKey) {
      if (apiKey.is_revoked) {
        done(
          new UnauthorizedException('The used API key has been revoked'),
          null,
        );
      } else if (
        apiKey.quota &&
        BigInt(apiKey.num_issued_requests) >= BigInt(apiKey.quota)
      ) {
        done(new UnauthorizedException('Max API key quota reached'), null);
      } else if (!apiKey.user) {
        done(
          new UnauthorizedException(
            'The used API key does not have any linked user',
          ),
          null,
        );
      }

      await this.apiKeysService.consumeQuota(apiKey);
      const userDto = plainToClass(FullUserDto, apiKey.user);
      done(null, userDto);
    } else {
      done(new UnauthorizedException('The API key is invalid'), null);
    }
  }
}
