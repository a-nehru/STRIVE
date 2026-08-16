import { Module } from '@nestjs/common';
import { WhitelistService } from './whitelist.service';
import { WhitelistController } from './whitelist.controller';

@Module({
  imports: [],
  controllers: [WhitelistController],
  providers: [WhitelistService],
})
export class WhitelistModule {}
