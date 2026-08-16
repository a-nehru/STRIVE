import { ICreateUserForDemoMode } from '@common-request-dto-interfaces/create-user-for-demo-mode.interface';
import { Exclude, Expose } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class CreateUserForDemoModeDto implements ICreateUserForDemoMode {
  @Expose()
  @IsNotEmpty()
  @IsString()
  @CustomApiProperty()
  readonly username: string;
}
