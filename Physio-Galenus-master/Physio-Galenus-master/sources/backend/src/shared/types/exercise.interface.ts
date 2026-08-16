import { EExerciseType } from '@common-enums/exercise-type.enum';
import { EPoseSide } from '@common-enums/pose-side.enum';
import { EPoseType } from '@common-enums/pose-type.enum';

/**
 * Interface representing an exercise loaded from a JSON file
 */
export interface IExercise {
  id: string;

  /**
   * The name of the exercise; will be printed during the workout scene
   */
  name: string;

  /**
   * The type of the exercise; will be used to print an icon
   */
  type: EExerciseType;

  /**
   * The number of sets; will be printed during the workout scene
   */
  sets: number;

  /**
   * The number of repetitions per set; will be printed during the workout scene
   */
  reps: number;

  /**
   * The number of milliseconds to complete the exercise
   */
  time: number;

  /**
   * The number of seconds to pause the workout after a set is completed
   */
  restBetweenSets: number;

  /**
   * The identifiers of the joints involved in the exercise
   */
  joints: IJoint[];

  /**
   * It indicates the type of posture required to perform the exercise
   */
  poseType: EPoseType;

  /**
   * It just to indicate the posture side required to perform the exercise
   */
  poseSide: EPoseSide;

  /**
   * An ordered list of the waypoints to follow during the exercise
   */
  waypoints: IExerciseWaypoint[];

  /**
   * The properties related to exercise content, not about performance
   */
  metadata: IExerciseMetadata;

  /*
   * TODO: Remove when progress is implemented in patient's application
   */
  isCompleted?: boolean;
}

export interface IJoint {
  /**
   * The index of the joint based on media pipe library
   */
  index: number;

  /**
   * Whether or not the joint must be fixed in a position
   */
  fixed: boolean;
}

export interface IExerciseWaypoint {
  /**
   * The X coord of the waypoint, from 0 to 1
   */
  x: number;

  /**
   * The Y coord of the waypoint, from 0 to 1
   */
  y: number;

  /**
   * The Z coord of the waypoint, from 0 to 1
   */
  z: number;

  /**
   * The scale of the game object associated with the waypoint; set it to 1 for no scale
   */
  scale: number;

  /**
   * The index of the joint that has to collide with this waypoint; defined in the `joints` list in the parent interface
   */
  jointIndex: number;

  /**
   * Whether the waypoint represents a target; it means the joint must touch this waypoint all the time during the game
   */
  isTarget: boolean;

  /**
   * A number specifying the amount of time the joint should be colliding with this waypoint to be considered collided
   * Not implemented yet
   */
  holdingTime: number;

  /**
   * A list of waypoints that have to be colliding for the current waypoint to be considered collided
   */
  waypointsRequired: number[];
}

export interface IExerciseMetadata {
  /**
   * File location of a video as a tutorial for the exercise
   */
  videoPath: string;

  /**
   * Name of the video as a tutorial for the exercise
   */
  videoKey: string;
}

export interface IExerciseAutonomousConfig {
  time: number;
  rest_between_sets: number;
  sets: number;
  reps: number;
}

export interface IWaypointTimestamp {
  /**
   * The index in the list of waypoints of the exercise
   */
  waypointIndex: number;

  /**
   * The number of seconds since the start of the execution of the exercise
   */
  timestamp: number;
}
