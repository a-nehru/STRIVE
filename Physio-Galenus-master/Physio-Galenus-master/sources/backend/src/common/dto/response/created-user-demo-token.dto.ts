import { ICreatedUserDemoToken } from '@common-response-dto-interfaces/created-user-demo-token.interface';
import { Exclude, Expose } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class CreatedUserDemoTokenDto implements ICreatedUserDemoToken {
  @Expose()
  @CustomApiProperty()
  readonly token: string;
}
