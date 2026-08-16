import { IAppError } from '@common-response-dto-interfaces/app-error.interface';
import { Exclude, Expose } from 'class-transformer';
import { IsJSON } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class AppErrorDto implements IAppError {
  @Expose()
  @CustomApiProperty()
  readonly statusCode: number;

  @Expose()
  @CustomApiProperty()
  readonly message: string;

  @Expose()
  @IsJSON()
  @CustomApiProperty()
  readonly additionalData: string;

  @Expose()
  @CustomApiProperty()
  readonly timestamp: string;

  @Expose()
  @CustomApiProperty()
  readonly path: string;
}
