import { Exclude, Expose, Type } from 'class-transformer';
import { IsNumberString, IsOptional, ValidateNested } from 'class-validator';
import { RequestDto } from './request.dto';
import { IReadChangelogFileOptions } from '../../interfaces/changelog.interface';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
class FilterChangelogChangesListDtoData implements IReadChangelogFileOptions {
  @Expose()
  @IsOptional()
  @IsNumberString()
  @CustomApiProperty()
  amount?: number;
}

@Exclude()
export class FilterChangelogChangesListDto extends RequestDto {
  @Expose()
  @ValidateNested()
  @Type(() => FilterChangelogChangesListDtoData)
  @CustomApiProperty()
  data: FilterChangelogChangesListDtoData;
}
