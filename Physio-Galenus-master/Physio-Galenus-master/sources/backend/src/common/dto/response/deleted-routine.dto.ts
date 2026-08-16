import { IDeletedRoutine } from '@common-response-dto-interfaces/deleted-routine.interface';
import { Exclude, Expose } from 'class-transformer';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class DeletedRoutineDto implements IDeletedRoutine {
  @Expose()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @CustomApiProperty()
  readonly name: string;
}
