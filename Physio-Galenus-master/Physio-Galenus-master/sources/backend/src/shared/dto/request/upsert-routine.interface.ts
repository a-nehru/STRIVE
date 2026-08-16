import { EDaysOfWeek } from '@common-enums/days-of-week.enum';
import { IUpsertRoutineToExercise } from './upsert-routine-to-exercise.interface';

export interface IUpsertRoutine {
  name: string;
  start_date: string;
  end_date: string;
  repetition_weekdays: EDaysOfWeek[];
  routine_to_exercise: IUpsertRoutineToExercise[];
}
