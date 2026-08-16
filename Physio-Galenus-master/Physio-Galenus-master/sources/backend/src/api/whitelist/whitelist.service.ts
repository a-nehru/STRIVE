import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { isDefined } from 'class-validator';
import { AddUsernameToWhitelistDto } from 'src/common/dto/request/add-username-to-whitelist.dto';
import { Whitelist } from 'src/database/entity';
import { Connection } from 'typeorm';
import { AppError } from '../errors/app-error.exception';

@Injectable()
export class WhitelistService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async addUsernameToWhitelist(
    query: AddUsernameToWhitelistDto,
  ): Promise<boolean> {
    const { manager } = this.connection;

    return await manager.transaction(async (em) => {
      const existingWhitelistEntry = await em
        .getRepository(Whitelist)
        .createQueryBuilder('whitelist')
        .where('whitelist.username = :userEmail', {
          userEmail: query.username.toLowerCase(),
        })
        .getOne();

      if (!existingWhitelistEntry) {
        await em.getRepository(Whitelist).save(
          em.create(Whitelist, {
            username: query.username.toLowerCase(),
          }),
        );
      }
      return true;
    });
  }
}
