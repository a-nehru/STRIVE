import { Module } from '@nestjs/common';
import { InstanceHealthController } from './instance-health.controller';

@Module({
  controllers: [InstanceHealthController],
})
export class InstanceHealthModule {}
