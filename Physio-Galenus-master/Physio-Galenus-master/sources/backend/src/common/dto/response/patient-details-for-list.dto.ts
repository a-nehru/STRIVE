import { Exclude, Expose, Type } from 'class-transformer';
import { PaginatedResponseDto } from './paginated-response.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class PatientDetailsForListDtoData {
  @Expose()
  @CustomApiProperty()
  readonly nickname: string;

  @Expose()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @CustomApiProperty()
  readonly public_id: number;

  @Expose()
  @CustomApiProperty()
  readonly email: string;

  @Expose()
  @CustomApiProperty()
  readonly access_token: string;
}

@Exclude()
export class PatientDetailsForListDto extends PaginatedResponseDto {
  @Expose()
  @Type(() => PatientDetailsForListDtoData)
  @CustomApiProperty()
  data: PatientDetailsForListDtoData[];
}
