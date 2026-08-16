import { Module } from '@nestjs/common';
import { PatientsModule } from '../patients/patients.module';
import { UsersSearchService } from './users-search.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [PatientsModule],
  controllers: [UsersController],
  providers: [UsersService, UsersSearchService],
  exports: [UsersService],
})
export class UsersModule {}
