import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingPlan } from 'src/database/entity';
import { PricingPlansController } from './pricing-plans.controller';
import { PricingPlansService } from './pricing-plans.service';

@Module({
  imports: [TypeOrmModule.forFeature([PricingPlan])],
  controllers: [PricingPlansController],
  providers: [PricingPlansService],
})
export class PricingPlansModule {}
