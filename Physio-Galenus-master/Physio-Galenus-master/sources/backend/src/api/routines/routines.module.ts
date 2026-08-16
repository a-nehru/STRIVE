import { Module } from '@nestjs/common';
import { RoutinesAdjustDifficultyService } from './adjust-difficulty/routines-adjust-difficulty.service';
import { RoutinesSearchService } from './routines-search.service';
import { RoutinesController } from './routines.controller';
import { RoutinesService } from './routines.service';

@Module({
  imports: [],
  controllers: [RoutinesController],
  providers: [
    RoutinesService,
    RoutinesSearchService,
    RoutinesAdjustDifficultyService,
  ],
})
export class RoutinesModule {}
