import { Module } from '@nestjs/common';
import { PatientsSearchService } from './patients-search.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
  imports: [],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsSearchService],
  exports: [PatientsService],
})
export class PatientsModule {}
