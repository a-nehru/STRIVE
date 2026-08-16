import { EDaysOfWeek } from '@common-enums/days-of-week.enum';
import { IExercise } from '@common-types/exercise.interface';
export interface IFullRoutine {
  readonly id: string;
  readonly name: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly repetitionWeekdays: EDaysOfWeek[];
  readonly exercises: IExercise[];
}
