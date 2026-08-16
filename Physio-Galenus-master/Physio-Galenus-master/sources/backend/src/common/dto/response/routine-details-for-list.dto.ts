import { EDaysOfWeek } from '@common-enums/days-of-week.enum';
import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { PaginatedResponseDto } from './paginated-response.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class RoutineDetailsForListDtoData {
  @Expose()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @CustomApiProperty()
  readonly name: string;

  @Expose({ name: 'start_date' })
  @Transform(({ value: start_date }) => new Date(start_date))
  @CustomApiProperty()
  readonly startDate: Date;

  @Expose({ name: 'end_date' })
  @Transform(({ value: end_date }) => new Date(end_date))
  @CustomApiProperty()
  readonly endDate: Date;

  @Expose({ name: 'repetition_weekdays' })
  @Transform(({ value: repetition_weekdays }) => repetition_weekdays)
  @CustomApiProperty()
  readonly repetitionWeekdays: EDaysOfWeek[];
}

@Exclude()
export class RoutineDetailsForListDto extends PaginatedResponseDto {
  @Expose()
  @Type(() => RoutineDetailsForListDtoData)
  @CustomApiProperty()
  data: RoutineDetailsForListDtoData[];
}
