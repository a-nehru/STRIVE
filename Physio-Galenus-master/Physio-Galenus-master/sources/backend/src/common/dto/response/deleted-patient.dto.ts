import { IDeletedPatient } from '@common-response-dto-interfaces/deleted-patient.interface';
import { Exclude, Expose } from 'class-transformer';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class DeletedPatientDto implements IDeletedPatient {
  @Expose()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @CustomApiProperty()
  readonly nickname: string;
}
