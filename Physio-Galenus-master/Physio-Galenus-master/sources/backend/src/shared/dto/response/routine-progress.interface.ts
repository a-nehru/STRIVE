import { IWaypointTimestamp } from '@common-types/exercise.interface';

export interface IRoutineProgress {
  exerciseId: string;
  currentSet: number;
  nextSet: number;
  maxSets: number;
  completionTime: number;
  mistakes: number;
  waypointTimestamps: IWaypointTimestamp[];
}
