import { Module } from '@nestjs/common';
import { ExercisesSearchService } from './exercises-search.service';
import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';

@Module({
  imports: [],
  controllers: [ExercisesController],
  providers: [ExercisesService, ExercisesSearchService],
})
export class ExercisesModule {}
