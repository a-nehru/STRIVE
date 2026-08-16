import { IDeletedUser } from '@common-response-dto-interfaces/deleted-user.interface';
import { Exclude, Expose } from 'class-transformer';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class DeletedUserDto implements IDeletedUser {
  @Expose()
  @CustomApiProperty()
  readonly id: string;
}
