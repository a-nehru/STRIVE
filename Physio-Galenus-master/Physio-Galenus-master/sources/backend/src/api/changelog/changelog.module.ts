import { Module } from '@nestjs/common';
import { ChangelogController } from './changelog.controller';
import { ChangelogService } from './changelog.service';

@Module({
  providers: [ChangelogService],
  controllers: [ChangelogController],
})
export class ChangelogModule {}
