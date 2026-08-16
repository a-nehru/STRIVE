import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { InjectEventEmitter } from 'nest-emitter';
import { LogAppErrorDto } from 'src/common/dto/request/log-app-error.dto';
import { ErrorEmitter } from 'src/events/error.events';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { AppError, AppErrorTag } from './app-error.exception';

@Controller('errors')
export class AppErrorController {
  constructor(
    @InjectEventEmitter() private readonly errorEmitter: ErrorEmitter,
  ) {}

  @Post()
  @UsePipes(CustomValidationPipe)
  createError(@Body() logAppErrorDto: LogAppErrorDto): void {
    const { message, additionalData } = logAppErrorDto;
    this.errorEmitter.emit(
      'error',
      new AppError({ message, additionalData, tag: AppErrorTag.Client }),
    );
  }
}
