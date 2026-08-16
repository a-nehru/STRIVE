import { EGender } from '@common-enums/gender.enum';
import { IPatientSettings } from '@common-types/patient-settings.interface';

export interface IFullPatient {
  id: string;
  public_id: number;
  nickname: string;
  email: string;
  therapist_id: string;
  birth_date: Date;
  gender: EGender;
  prefer_to_self_describe_text: string;
  access_token: string;
  routine_id: string;
  settings: IPatientSettings;
}
