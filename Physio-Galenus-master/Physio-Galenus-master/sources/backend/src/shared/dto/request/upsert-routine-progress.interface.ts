import { IWaypointTimestamp } from '@common-types/exercise.interface';

export interface IMovementCompensation {
  compensation: number;
  validity: number;
}
export interface IUpsertRoutineProgress {
  exerciseId: string;
  currentSet: number;
  nextSet: number;
  maxSets: number;
  completionTime: number;
  mistakes: number;
  completion: number;
  reps: number;
  movementCompensations: IMovementCompensation[][];
  movementSpeeds: number[];
  repetitionTimes: number[];
  repetitionMistakes: number[];
  waypointTimestamps: IWaypointTimestamp[];
}
