import { EExerciseType } from '@common-enums/exercise-type.enum';
import { EPoseSide } from '@common-enums/pose-side.enum';
import { EPoseType } from '@common-enums/pose-type.enum';
import { EStrokeSide } from '@common-enums/stroke-side.enum';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { Exercise } from '../entity';

// Add a sample exercise for development use only
export class SeedSampleExercises1633860909568 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const { manager } = queryRunner;
    const sampleExercises = [
      manager.create(Exercise, {
        name: 'Open arm movement - left',
        type: EExerciseType.Strength,
        pose_type: EPoseType.UpperBody,
        pose_side: EPoseSide.Front,
        stroke_side: EStrokeSide.Right,
        joints: [
          {
            index: 14,
            fixed: true,
          },
          {
            index: 16,
            fixed: false,
          },
        ],
        waypoints: [
          {
            x: 0.29,
            y: 0.66,
            z: 0,
            waypointsRequired: [],
            holdingTime: 0,
            scale: 1,
            jointIndex: 0,
            isTarget: true,
          },
          {
            x: 0.18,
            y: 0.49,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
          {
            x: 0.4,
            y: 0.49,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
        ],
        metadata: {
          videoPath: 'assets/video/open-arm-movement-left.mp4',
          videoKey: 'open-arm-movement-left',
        },
        autonomous_config: {
          time: 120,
          rest_between_sets: 120,
          sets: 3,
          reps: 6,
        },
      }),
      manager.create(Exercise, {
        name: 'Extending the elbow - left',
        type: EExerciseType.Strength,
        pose_type: EPoseType.UpperBody,
        pose_side: EPoseSide.Front,
        stroke_side: EStrokeSide.Right,
        joints: [
          {
            index: 14,
            fixed: true,
          },
          {
            index: 16,
            fixed: false,
          },
        ],
        waypoints: [
          {
            x: 0.29,
            y: 0.63,
            z: 0,
            waypointsRequired: [],
            holdingTime: 0,
            scale: 1,
            jointIndex: 0,
            isTarget: true,
          },
          {
            x: 0.19,
            y: 0.45,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.3,
            jointIndex: 1,
            isTarget: false,
          },
          {
            x: 0.3,
            y: 0.37,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.35,
            jointIndex: 1,
            isTarget: false,
          },
          {
            x: 0.4,
            y: 0.44,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
        ],
        metadata: {
          videoPath: 'assets/video/extending-the-elbow-left.mp4',
          videoKey: 'extending-the-elbow-left',
        },
        autonomous_config: {
          time: 120,
          rest_between_sets: 120,
          sets: 3,
          reps: 6,
        },
      }),
      manager.create(Exercise, {
        name: 'Extending the elbow - right',
        type: EExerciseType.Strength,
        pose_type: EPoseType.UpperBody,
        pose_side: EPoseSide.Front,
        stroke_side: EStrokeSide.Left,
        joints: [
          {
            index: 13,
            fixed: true,
          },
          {
            index: 15,
            fixed: false,
          },
        ],
        waypoints: [
          {
            x: 0.7,
            y: 0.56,
            z: 0,
            waypointsRequired: [],
            holdingTime: 0,
            scale: 1,
            jointIndex: 0,
            isTarget: true,
          },
          {
            x: 0.79,
            y: 0.41,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.3,
            jointIndex: 1,
            isTarget: false,
          },
          {
            x: 0.68,
            y: 0.32,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.35,
            jointIndex: 1,
            isTarget: false,
          },
          {
            x: 0.58,
            y: 0.44,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
        ],
        metadata: {
          videoPath: 'assets/video/extending-the-elbow-right.mp4',
          videoKey: 'extending-the-elbow-right',
        },
        autonomous_config: {
          time: 120,
          rest_between_sets: 120,
          sets: 3,
          reps: 6,
        },
      }),
      manager.create(Exercise, {
        name: 'Open arm movement - right',
        type: EExerciseType.Strength,
        pose_type: EPoseType.UpperBody,
        pose_side: EPoseSide.Front,
        stroke_side: EStrokeSide.Left,
        joints: [
          {
            index: 13,
            fixed: true,
          },
          {
            index: 15,
            fixed: false,
          },
        ],
        waypoints: [
          {
            x: 0.69,
            y: 0.68,
            z: 0,
            waypointsRequired: [],
            holdingTime: 0,
            scale: 1,
            jointIndex: 0,
            isTarget: true,
          },
          {
            x: 0.8,
            y: 0.51,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
          {
            x: 0.59,
            y: 0.51,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
        ],
        metadata: {
          videoPath: 'assets/video/open-arm-movement-right.mp4',
          videoKey: 'open-arm-movement-right',
        },
        autonomous_config: {
          time: 120,
          rest_between_sets: 120,
          sets: 3,
          reps: 6,
        },
      }),
      manager.create(Exercise, {
        name: 'Side arm raise - left',
        type: EExerciseType.Strength,
        pose_type: EPoseType.UpperBody,
        pose_side: EPoseSide.Front,
        stroke_side: EStrokeSide.Right,
        joints: [
          {
            index: 12,
            fixed: true,
          },
          {
            index: 16,
            fixed: false,
          },
        ],
        waypoints: [
          {
            x: 0.46,
            y: 0.58,
            z: 0,
            waypointsRequired: [],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 0,
            isTarget: true,
          },
          {
            x: 0.2,
            y: 0.74,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
          {
            x: 0.2,
            y: 0.39,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
        ],
        metadata: {
          videoPath: 'assets/video/side-arm-raise-left.mp4',
          videoKey: 'side-arm-raise-left',
        },
        autonomous_config: {
          time: 120,
          rest_between_sets: 120,
          sets: 3,
          reps: 6,
        },
      }),
      manager.create(Exercise, {
        name: 'Side arm rise - right',
        type: EExerciseType.Strength,
        pose_type: EPoseType.UpperBody,
        pose_side: EPoseSide.Front,
        stroke_side: EStrokeSide.Left,
        joints: [
          {
            index: 11,
            fixed: true,
          },
          {
            index: 15,
            fixed: false,
          },
        ],
        waypoints: [
          {
            x: 0.62,
            y: 0.67,
            z: 0,
            waypointsRequired: [],
            holdingTime: 0,
            scale: 1,
            jointIndex: 0,
            isTarget: true,
          },
          {
            x: 0.83,
            y: 0.66,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
          {
            x: 0.8,
            y: 0.4,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
        ],
        metadata: {
          videoPath: 'assets/video/side-arm-raise-right.mp4',
          videoKey: 'side-arm-raise-right',
        },
        autonomous_config: {
          time: 120,
          rest_between_sets: 120,
          sets: 3,
          reps: 6,
        },
      }),
      manager.create(Exercise, {
        name: 'Weighted bicep curl - left',
        type: EExerciseType.Strength,
        pose_type: EPoseType.UpperBody,
        pose_side: EPoseSide.LateralLeft,
        stroke_side: EStrokeSide.Right,
        joints: [
          {
            index: 14,
            fixed: true,
          },
          {
            index: 16,
            fixed: false,
          },
        ],
        waypoints: [
          {
            x: 0.43,
            y: 0.79,
            z: 0,
            waypointsRequired: [],
            holdingTime: 0,
            scale: 1,
            jointIndex: 0,
            isTarget: true,
          },
          {
            x: 0.6,
            y: 0.8,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
          {
            x: 0.5,
            y: 0.53,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
        ],
        metadata: {
          videoPath: 'assets/video/weighted-bicep-curl-left.mp4',
          videoKey: 'weighted-bicep-curl-left',
        },
        autonomous_config: {
          time: 120,
          rest_between_sets: 120,
          sets: 3,
          reps: 6,
        },
      }),
      manager.create(Exercise, {
        name: 'Weighted bicep curl - right',
        type: EExerciseType.Strength,
        pose_type: EPoseType.UpperBody,
        pose_side: EPoseSide.LateralRight,
        stroke_side: EStrokeSide.Left,
        joints: [
          {
            index: 13,
            fixed: true,
          },
          {
            index: 15,
            fixed: false,
          },
        ],
        waypoints: [
          {
            x: 0.53,
            y: 0.8,
            z: 0,
            waypointsRequired: [],
            holdingTime: 0,
            scale: 1,
            jointIndex: 0,
            isTarget: true,
          },
          {
            x: 0.37,
            y: 0.79,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
          {
            x: 0.48,
            y: 0.54,
            z: 0,
            waypointsRequired: [0],
            holdingTime: 0,
            scale: 0.4,
            jointIndex: 1,
            isTarget: false,
          },
        ],
        metadata: {
          videoPath: 'assets/video/weighted-bicep-curl-right.mp4',
          videoKey: 'weighted-bicep-curl-right',
        },
        autonomous_config: {
          time: 120,
          rest_between_sets: 120,
          sets: 3,
          reps: 6,
        },
      }),
    ];
    await manager.getRepository(Exercise).save(sampleExercises);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DELETE FROM "public".exercise WHERE "name" = $1', [
      'Open arm movement - left',
    ]);

    await queryRunner.query('DELETE FROM "public".exercise WHERE "name" = $1', [
      'Extending the elbow - left',
    ]);

    await queryRunner.query('DELETE FROM "public".exercise WHERE "name" = $1', [
      'Extending the elbow - right',
    ]);

    await queryRunner.query('DELETE FROM "public".exercise WHERE "name" = $1', [
      'Open arm movement - right',
    ]);

    await queryRunner.query('DELETE FROM "public".exercise WHERE "name" = $1', [
      'Side arm raise - left',
    ]);

    await queryRunner.query('DELETE FROM "public".exercise WHERE "name" = $1', [
      'Side arm rise - right',
    ]);

    await queryRunner.query('DELETE FROM "public".exercise WHERE "name" = $1', [
      'Weighted bicep curl - left',
    ]);

    await queryRunner.query('DELETE FROM "public".exercise WHERE "name" = $1', [
      'Weighted bicep curl - right',
    ]);
  }
}
