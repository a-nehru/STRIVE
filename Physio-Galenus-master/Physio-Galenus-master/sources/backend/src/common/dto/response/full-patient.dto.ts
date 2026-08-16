import { EGender } from '@common-enums/gender.enum';
import { EStrokeSide } from '@common-enums/stroke-side.enum';
import { IFullPatient } from '@common-response-dto-interfaces/full-patient.interface';
import { IPatientSettings } from '@common-types/patient-settings.interface';
import { Exclude, Expose, Transform } from 'class-transformer';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class FullPatientDto implements IFullPatient {
  @Expose()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @CustomApiProperty()
  readonly public_id: number;

  @Expose()
  @CustomApiProperty()
  readonly nickname: string;

  @Expose()
  @CustomApiProperty()
  readonly email: string;

  @Expose()
  @CustomApiProperty()
  @Transform(({ value: therapist }) => therapist?.id)
  readonly therapist_id: string;

  @Expose()
  @CustomApiProperty()
  @Transform(({ value: birth_date }) =>
    birth_date ? new Date(birth_date) : undefined,
  )
  readonly birth_date: Date;

  @Expose()
  @CustomApiProperty()
  readonly gender: EGender;

  @Expose()
  @CustomApiProperty()
  readonly stroke_side: EStrokeSide;

  @Expose()
  @CustomApiProperty()
  @Transform(({ obj }) => obj?.difficulty_data?.mobility)
  readonly mobility: number;

  @Expose()
  @CustomApiProperty()
  readonly prefer_to_self_describe_text: string;

  @Expose()
  @CustomApiProperty()
  readonly access_token: string;

  @Expose({ name: 'routine' })
  @Transform(({ value: routine }) => routine?.id)
  readonly routine_id: string;

  @Expose()
  @CustomApiProperty()
  readonly settings: IPatientSettings;
}
