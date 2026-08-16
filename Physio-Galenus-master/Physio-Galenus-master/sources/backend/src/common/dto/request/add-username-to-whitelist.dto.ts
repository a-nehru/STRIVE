import { IAddUsernameToWhitelist } from '@common-request-dto-interfaces/add-username-to-whitelist.interface';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';
import { Exclude, Expose } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

@Exclude()
export class AddUsernameToWhitelistDto implements IAddUsernameToWhitelist {
  @Expose()
  @IsNotEmpty()
  @IsString()
  @CustomApiProperty()
  readonly apiKey: string;

  @Expose()
  @IsNotEmpty()
  @IsString()
  @CustomApiProperty()
  readonly username: string;
}
