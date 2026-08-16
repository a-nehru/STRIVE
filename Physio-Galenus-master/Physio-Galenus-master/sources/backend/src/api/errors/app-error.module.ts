import { Module } from '@nestjs/common';
import { AppErrorController } from './app-error.controller';
import { AppErrorService } from './app-error.service';
import { NestEmitterModule } from 'nest-emitter';
import { EventEmitter } from 'events';

@Module({
  imports: [NestEmitterModule.forRoot(new EventEmitter())],
  providers: [AppErrorService],
  controllers: [AppErrorController],
  exports: [AppErrorService],
})
export class AppErrorModule {}
