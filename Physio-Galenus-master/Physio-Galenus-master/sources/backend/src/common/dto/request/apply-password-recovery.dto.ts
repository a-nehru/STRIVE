import { Exclude, Expose } from 'class-transformer';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class ApplyPasswordRecoveryDto {
  @Expose()
  @CustomApiProperty()
  readonly email: string;

  @Expose()
  @CustomApiProperty()
  readonly password: string;

  @Expose()
  @CustomApiProperty()
  readonly passwordCheck: string;
}
