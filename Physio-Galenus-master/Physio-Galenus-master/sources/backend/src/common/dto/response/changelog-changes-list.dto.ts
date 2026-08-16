import { Exclude, Expose, Type } from 'class-transformer';
import {
  IChangelog,
  IChangelogBlock,
} from '../../interfaces/changelog.interface';
import { ResponseDto } from './response.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
class ChangelogChangesListDtoData implements IChangelog {
  @Expose()
  @CustomApiProperty()
  version: string;

  @Expose()
  @CustomApiProperty()
  date: string;

  @Expose()
  @CustomApiProperty()
  blocks: IChangelogBlock[];
}

@Exclude()
export class ChangelogChangesListDto extends ResponseDto {
  @Expose()
  @Type(() => ChangelogChangesListDtoData)
  @CustomApiProperty()
  data: ChangelogChangesListDtoData[];
}
