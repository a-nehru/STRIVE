import { Exclude, Expose, Type } from 'class-transformer';
import { IsBooleanString, IsOptional, ValidateNested } from 'class-validator';
import { PaginatedRequestDto } from './paginated-request.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
class Data {
  @Expose()
  @IsOptional()
  @IsBooleanString()
  @CustomApiProperty()
  isHidden?: boolean;
}

@Exclude()
export class FilterRolesDto extends PaginatedRequestDto {
  @Expose()
  @ValidateNested()
  @Type(() => Data)
  @CustomApiProperty()
  data: Data;
}
