import { EGender } from '@common-enums/gender.enum';
import { EStrokeSide } from '@common-enums/stroke-side.enum';

export interface IUpsertPatient {
  nickname: string;
  email?: string;
  birth_date?: string;
  gender: EGender;
  stroke_side: EStrokeSide;
  mobility: number;
  prefer_to_self_describe_text?: string;
  routine_id?: string;
}
