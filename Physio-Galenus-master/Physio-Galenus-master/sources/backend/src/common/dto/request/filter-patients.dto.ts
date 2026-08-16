import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PaginatedRequestDto } from './paginated-request.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';
import { IFilterPatients } from '@common-interfaces/filter-patients.interface';
import { EGender } from '@common-enums/gender.enum';

@Exclude()
export class FilterPatientsDtoData implements IFilterPatients {
  @Expose()
  @IsOptional()
  @IsString()
  @CustomApiProperty()
  readonly public_id?: string;

  @Expose()
  @IsOptional()
  @IsISO8601()
  @CustomApiProperty()
  readonly birth_date?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @CustomApiProperty()
  readonly nickname?: string;

  @Expose()
  @IsOptional()
  @IsEnum(EGender)
  @CustomApiProperty()
  readonly gender?: EGender;

  @Expose()
  @IsOptional()
  @IsString()
  @CustomApiProperty()
  readonly email?: string;

  @Expose()
  @IsOptional()
  @IsString()
  @CustomApiProperty()
  readonly therapist_id?: string;
}

@Exclude()
export class FilterPatientsDto extends PaginatedRequestDto {
  @Expose()
  @ValidateNested()
  @Type(() => FilterPatientsDtoData)
  @CustomApiProperty()
  data: FilterPatientsDtoData;
}
