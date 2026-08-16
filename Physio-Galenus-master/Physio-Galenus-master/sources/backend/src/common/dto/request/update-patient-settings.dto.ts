import { IPatientSettings } from '@common-types/patient-settings.interface';
import { Exclude, Expose } from 'class-transformer';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class UpdatePatientSettingsDto {
  @Expose()
  @CustomApiProperty()
  settings: IPatientSettings;
}
