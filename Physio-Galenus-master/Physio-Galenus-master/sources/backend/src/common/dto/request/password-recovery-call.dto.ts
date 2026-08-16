import { Exclude, Expose } from 'class-transformer';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class PasswordRecoveryCallDto {
  @Expose()
  @CustomApiProperty()
  id: string;

  @Expose()
  @CustomApiProperty()
  email: string;

  @Expose()
  @CustomApiProperty()
  token: string;
}
