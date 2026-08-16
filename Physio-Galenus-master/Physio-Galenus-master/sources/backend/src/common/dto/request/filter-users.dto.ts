import { IFilterUsers } from '@common-request-dto-interfaces/filter-users.interface';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { PaginatedRequestDto } from './paginated-request.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class FilterUsersDtoData implements IFilterUsers {
  @Expose()
  @IsOptional()
  @IsString()
  @CustomApiProperty()
  username?: string;
}

@Exclude()
export class FilterUsersDto extends PaginatedRequestDto {
  @Expose()
  @ValidateNested()
  @Type(() => FilterUsersDtoData)
  @CustomApiProperty()
  data: FilterUsersDtoData;
}
