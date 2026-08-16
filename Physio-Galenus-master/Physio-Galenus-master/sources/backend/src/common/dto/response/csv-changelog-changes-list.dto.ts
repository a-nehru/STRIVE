import { Exclude, Expose } from 'class-transformer';
import { EChangelogBlockType } from '../../enums/changelog-block.enum';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class CsvChangelogChangesListDto {
  @Expose()
  @CustomApiProperty()
  version: string;

  @Expose()
  @CustomApiProperty()
  date: string;

  @Expose()
  @CustomApiProperty()
  type: EChangelogBlockType;

  @Expose()
  @CustomApiProperty()
  description: string;

  @Expose()
  @CustomApiProperty()
  pr: string;

  @Expose()
  @CustomApiProperty()
  trello: string;

  @Expose()
  @CustomApiProperty()
  jira: string;
}
