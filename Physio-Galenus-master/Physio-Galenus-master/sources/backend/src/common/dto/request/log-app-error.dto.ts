import { ILogAppError } from '@common-request-dto-interfaces/log-app-error.interface';
import { Exclude, Expose } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class LogAppErrorDto implements ILogAppError {
  @Expose()
  @IsString()
  @CustomApiProperty()
  readonly message: string;

  @Expose()
  @IsOptional()
  @CustomApiProperty()
  readonly additionalData: string;
}
