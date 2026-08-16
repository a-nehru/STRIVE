import { EGender } from '@common-enums/gender.enum';
import { EStrokeSide } from '@common-enums/stroke-side.enum';
import { IUpsertPatient } from '@common-request-dto-interfaces/upsert-patient.interface';
import { Exclude, Expose } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class UpsertPatientDto implements IUpsertPatient {
  @Expose()
  @IsNotEmpty()
  @IsString()
  @CustomApiProperty()
  readonly nickname: string;

  @Expose()
  @IsOptional()
  @IsEmail()
  @CustomApiProperty()
  readonly email?: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  @CustomApiProperty()
  readonly birth_date?: string;

  @Expose()
  @IsEnum(EGender)
  @IsNotEmpty()
  @CustomApiProperty()
  readonly gender: EGender;

  @Expose()
  @IsEnum(EStrokeSide)
  @IsNotEmpty()
  readonly stroke_side: EStrokeSide;

  @Expose()
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsNotEmpty()
  readonly mobility: number;

  @Expose()
  @IsString()
  @IsOptional()
  @CustomApiProperty()
  readonly prefer_to_self_describe_text?: string;

  @Expose()
  @IsString()
  @IsOptional()
  @CustomApiProperty()
  readonly routine_id?: string;
}
