import { FullUserDto } from '@common-response-dto/full-user.dto';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { isDefined } from 'class-validator';
import { AppError } from 'src/api/errors/app-error.exception';
import {
  Exercise,
  ExerciseAdequacy,
  Patient,
  PatientDifficultyData,
  Routine,
  RoutineExecutionData,
  RoutineToExercise,
  User,
  UserNotification,
} from 'src/database/entity';
import {
  Brackets,
  Connection,
  EntityManager,
  SelectQueryBuilder,
} from 'typeorm';
import { callMethod } from './execute-r';
import {
  IExplanation,
  IExplanationClause,
  IExerciseExplanations,
  INewExerciseAdequacy,
  INewExerciseConfiguration,
} from '@common-interfaces/explanation.interface';
import {
  EExplanationFuzzyCategory,
  EExplanationVariable,
  EExplanationVariableData,
} from '@common-enums/explanation-variable.enum';
import { RoutineAdjustedDifficulty } from 'src/database/entity/routine_adjusted_difficulty.entity';
import { EStrokeSide } from '@common-enums/stroke-side.enum';
import { EDaysOfWeek } from '@common-enums/days-of-week.enum';
import { EUserNotificationSubject } from 'src/common/enums/user-notification-subject.enum';
import { isDevelopment } from '@common-utils/environment-utils';

type TExerciseExecution = {
  exercise: Exercise;
  time: number;
  completion: number;
  reps: number;
  compensation: number;
  fatigue: number;
  sets: number;
};

type TExplanationInference = {
  rule_string: string;
  input_values: { [key: string]: { [key: string]: number } };
  output_value: number;
};

type TExerciseInference = {
  rep_incr: number;
  set_incr: number;
  time_incr: number;
  adequacy_incr: number;
  explanations: TExplanationInference[];
  cluster?: number;
};

type TRoutineInference = {
  exergame_number: number;
  exergame_number_explanation: TExplanationInference;
  performance_incr: number;
  exergames_data: TExerciseInference[];
  representative_indexes: number[];
};

@Injectable()
export class RoutinesAdjustDifficultyService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  /**
   * Convenient method to check if some routine can be accessed by the provided user and
   * that the user can automatically adjust the routine difficulty
   * ALWAYS CHECK THIS BEFORE RETURNING ANY ROUTINE DATA
   * @param routine the routine
   * @param user the user
   * @returns true if the user can access this routine
   */
  private async checkIfUserCanAdjustRoutine(
    routine: Routine,
    user: Partial<FullUserDto>,
    em?: EntityManager,
  ): Promise<boolean> {
    const manager = em ? em : this.connection.manager;

    if (routine.therapist.id !== user.id) {
      throw new AppError({
        message: `You don't have permission to access this routine`,
      });
    }

    const userWithPricing = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.pricing_plan', 'pricing_plan')
      .where('user.id = :userId', { userId: user.id })
      .getOne();

    if (
      !userWithPricing.pricing_plan.automatic_exercise_difficulty_adaptation
    ) {
      throw new AppError({
        message: `You don't have permission to adapt the exercise difficulty`,
      });
    }

    return true;
  }

  private getRoutineQuery(em?: EntityManager): SelectQueryBuilder<Routine> {
    const manager = em ? em : this.connection.manager;
    return manager
      .getRepository(Routine)
      .createQueryBuilder('routine')
      .leftJoinAndSelect('routine.therapist', 'therapist')
      .leftJoinAndSelect('routine.patients', 'patient')
      .leftJoinAndSelect('routine.routine_to_exercise', 'routine_to_exercise')
      .leftJoinAndSelect('routine_to_exercise.exercise', 'exercise');
  }

  private async getDifficultyData(
    patientId: string,
    em?: EntityManager,
  ): Promise<PatientDifficultyData> {
    const manager = em ? em : this.connection.manager;
    return manager
      .getRepository(PatientDifficultyData)
      .createQueryBuilder('difficultyData')
      .leftJoinAndSelect('difficultyData.patient', 'patient')
      .where('patient.id = :patientId', { patientId })
      .getOne();
  }

  private clampValue(value: number, variable: EExplanationVariable) {
    const data = EExplanationVariableData[variable];
    if (data.step >= 1) {
      return Math.max(Math.min(Math.round(value), data.max), data.min);
    } else {
      return Math.max(Math.min(value, data.max), data.min);
    }
  }

  // Sample rule_string: "list(antecedent=mobility%is%M&&performance%is%M,consequent=exergame_number%is%M)"
  private parseExplanation(
    unparsedExplanation: TExplanationInference,
  ): IExplanation {
    const explanationPattern = /list\(antecedent=(.+),consequent=(.+)\)/g;
    const antecedentsAndConsequent = explanationPattern.exec(
      unparsedExplanation.rule_string,
    );

    const antecedents = antecedentsAndConsequent[1]
      .split('&&')
      .map((antecedent) =>
        this.parseClause(unparsedExplanation, antecedent.trim()),
      );
    const consequent = this.parseClause(
      unparsedExplanation,
      antecedentsAndConsequent[2],
    );

    return {
      antecedents,
      consequent,
    };
  }

  // Sample clause: "mobility%is%M"
  private parseClause(
    unparsedExplanation: TExplanationInference,
    unparsedClause: string,
  ): IExplanationClause {
    const variableAndValue = unparsedClause.split('%is%');
    const variable = variableAndValue[0] as EExplanationVariable;
    const fuzzy_category = variableAndValue[1] as EExplanationFuzzyCategory;

    return {
      variable,
      fuzzy_category,
      value:
        isDefined(unparsedExplanation.input_values[variable]) &&
        isDefined(unparsedExplanation.input_values[variable][variable])
          ? unparsedExplanation.input_values[variable][variable]
          : unparsedExplanation.output_value,
    };
  }

  async adjustRoutineDifficulty(
    routineId: string,
    user: Partial<FullUserDto>,
  ): Promise<RoutineAdjustedDifficulty> {
    const { manager } = this.connection;

    const routine = await manager.getRepository(Routine).findOne(routineId);
    if (routine.is_adjusting_difficulty) {
      throw new AppError({
        message:
          'A difficulty adjustment is already in progress for this routine',
      });
    }

    await manager
      .getRepository(Routine)
      .update(routineId, { is_adjusting_difficulty: true });

    try {
      return await manager.transaction(async (em) => {
        const {
          originalRoutine,
          exerciseExecutions,
          difficultyData,
          exerciseAdequacies,
        } = await this.fetchDataFromDatabase(routineId, user, em);

        if (exerciseExecutions.length <= 0) {
          throw new AppError({
            message: 'Not enough executions performed to adjust the routine',
          });
        }

        const dayCount = this.getExecutionDaysCount(originalRoutine);
        const inference = await this.performInference(
          exerciseExecutions,
          difficultyData,
          dayCount,
        );

        const routineAdjustedDifficulty = await this.updateDatabase(
          difficultyData,
          inference,
          em,
          exerciseAdequacies,
          originalRoutine,
          exerciseExecutions,
        );

        const now = new Date();
        const dueDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 30,
        );
        await em.save(UserNotification, {
          message: `The difficulty adjustment for routine '${originalRoutine.name}' has been completed`,
          is_read: false,
          is_notified: false,
          is_archived: false,
          due_date: dueDate.toISOString(),
          notification_date: now.toISOString(),
          subject: EUserNotificationSubject.Routine,
        });
        const populatedRoutineAdjustedDifficulty = this.loadExercises(
          routineAdjustedDifficulty,
        );
        return populatedRoutineAdjustedDifficulty;
      });
    } finally {
      await manager
        .getRepository(Routine)
        .update(routineId, { is_adjusting_difficulty: false });
    }
  }

  private async fetchDataFromDatabase(
    routineId: string,
    user: Partial<FullUserDto>,
    em: EntityManager,
  ): Promise<{
    originalRoutine: Routine;
    exerciseExecutions: TExerciseExecution[];
    difficultyData: PatientDifficultyData;
    exerciseAdequacies: ExerciseAdequacy[];
  }> {
    const originalRoutine = await this.getRoutineQuery(em)
      .where('routine.id = :routineId', { routineId })
      .getOneOrFail();
    await this.checkIfUserCanAdjustRoutine(originalRoutine, user, em);
    const patient = originalRoutine.patients[0];

    if (!isDefined(patient)) {
      throw new AppError({
        message: 'There is no patient assigned to this routine',
      });
    }

    let difficultyData = await this.getDifficultyData(patient.id, em);
    if (!isDefined(difficultyData)) {
      difficultyData = await em.getRepository(PatientDifficultyData).save({
        patient: { id: patient.id },
        mobility: 50,
        performance: 50,
      });
    }

    const routineExecutionData = await em
      .getRepository(RoutineExecutionData)
      .createQueryBuilder('routineExecutionData')
      .leftJoinAndSelect('routineExecutionData.exercise', 'exercise')
      .leftJoinAndSelect('routineExecutionData.routine', 'routine')
      .where(
        isDefined(originalRoutine.start_date)
          ? `create_date >= :startDate`
          : '1=1',
        { startDate: originalRoutine.start_date },
      )
      .andWhere(
        isDefined(originalRoutine.end_date) ? `create_date <= :endDate` : '1=1',
        { endDate: originalRoutine.end_date },
      )
      .andWhere('routine.id = :routineId', { routineId })
      .getMany();
    if (routineExecutionData.length <= 0) {
      throw new AppError({
        message: 'Not enough executions performed to adjust the routine',
      });
    }

    let startDate: Date;
    if (isDefined(difficultyData.last_inference)) {
      startDate = new Date(difficultyData.last_inference);
      startDate.setUTCDate(startDate.getUTCDate() + 1);
    } else {
      startDate = routineExecutionData
        .map((el) => el.create_date)
        .reduce((d1, d2) => (d1 < d2 ? d1 : d2));
    }

    const exerciseExecutions: TExerciseExecution[] = [];
    const exerciseIds: string[] = routineExecutionData.reduce(
      (exerciseIds, el) =>
        exerciseIds.includes(el.exercise.id)
          ? exerciseIds
          : exerciseIds.concat([el.exercise.id]),
      [],
    );
    exerciseIds.forEach((exerciseId) => {
      const plannedData = originalRoutine.routine_to_exercise.find(
        (el) => el.exercise.id === exerciseId,
      );
      const executionData = routineExecutionData.filter(
        (el) => el.exercise.id === exerciseId,
      );
      const accumulatedExecData = executionData.reduce(
        (acc, el) => {
          return {
            time: acc.time + el.completion_time,
            reps: acc.reps + el.reps,
            compensation: acc.compensation + el.compensation,
            fatigue: acc.fatigue + el.fatigue,
            sets: acc.sets + 1,
          };
        },
        {
          time: 0,
          reps: 0,
          compensation: 0,
          fatigue: 0,
          sets: 0,
        },
      );

      exerciseExecutions.push({
        exercise: executionData[0].exercise,
        time: accumulatedExecData.time,
        reps: accumulatedExecData.reps,
        compensation: accumulatedExecData.compensation
          ? accumulatedExecData.compensation / executionData.length
          : 0,
        fatigue: accumulatedExecData.fatigue
          ? accumulatedExecData.fatigue / executionData.length
          : 0,
        sets: accumulatedExecData.sets,
        completion: isDefined(plannedData)
          ? (100 * accumulatedExecData.reps) /
            (plannedData.sets * plannedData.reps)
          : 0,
      });
    });

    const exerciseAdequacies = await Promise.all(
      exerciseIds.map(async (exerciseId) => {
        let adequacy = await em
          .getRepository(ExerciseAdequacy)
          .createQueryBuilder('exercise_adequacy')
          .leftJoinAndSelect('exercise_adequacy.exercise', 'exercise')
          .leftJoinAndSelect(
            'exercise_adequacy.difficulty_data',
            'difficulty_data',
          )
          .where('exercise.id = :exerciseId', { exerciseId })
          .andWhere('difficulty_data.id = :ddId', {
            ddId: difficultyData.id,
          })
          .getOne();

        if (!isDefined(adequacy)) {
          adequacy = await em.getRepository(ExerciseAdequacy).save({
            adequacy: 50,
            exercise: { id: exerciseId },
            difficulty_data: difficultyData,
          });
        }

        return adequacy;
      }),
    );

    return {
      originalRoutine,
      exerciseExecutions,
      difficultyData,
      exerciseAdequacies,
    };
  }

  private getExecutionDaysCount(routine: Routine): number {
    const days = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    let dayCount = 0;
    const startDate = new Date(routine.start_date);
    const endDate = new Date(routine.end_date);

    for (let i = startDate; i <= endDate; i.setDate(i.getDate() + 1)) {
      if (
        routine.repetition_weekdays.includes(days[i.getDay()] as EDaysOfWeek)
      ) {
        dayCount++;
      }
    }

    return dayCount;
  }

  private async performInference(
    exerciseExecutions: TExerciseExecution[],
    difficultyData: PatientDifficultyData,
    dayCount: number,
  ): Promise<TRoutineInference> {
    const exerciseExecutionObjects = exerciseExecutions.map((exec) => {
      const exergame_diff = isDefined(exec.exercise?.difficulty)
        ? this.clampValue(
            exec.exercise.difficulty,
            EExplanationVariable.EXERGAME_DIFF,
          )
        : 50;

      return {
        exergame_diff,
        time: this.clampValue(exec.time / dayCount, EExplanationVariable.TIME),
        completion: this.clampValue(
          exec.completion / dayCount,
          EExplanationVariable.COMPLETION,
        ),
        reps: this.clampValue(exec.reps / dayCount, EExplanationVariable.REPS),
        compensation: this.clampValue(
          exec.compensation,
          EExplanationVariable.COMPENSATION,
        ),
        fatigue: this.clampValue(exec.fatigue, EExplanationVariable.FATIGUE),
        sets: this.clampValue(exec.sets / dayCount, EExplanationVariable.SETS),
      };
    });

    const inference_raw = await callMethod(
      isDevelopment()
        ? './src/api/routines/adjust-difficulty/main.r'
        : 'main.r',
      'infer_all_execution_data',
      {
        routine_json: JSON.stringify({
          performance: this.clampValue(
            difficultyData.performance,
            EExplanationVariable.PERFORMANCE,
          ),
          mobility: this.clampValue(
            difficultyData.mobility,
            EExplanationVariable.MOBILITY,
          ),
          exergames: exerciseExecutionObjects,
        }).replace(/"/g, '\\"'),
      },
    );
    const inference: TRoutineInference = JSON.parse(
      inference_raw.join('').replace(/\\n/g, '').replace(/\\/g, '"'),
    );
    return inference;
  }

  private async updateDatabase(
    difficultyData: PatientDifficultyData,
    inference: TRoutineInference,
    em: EntityManager,
    exerciseAdequacies: ExerciseAdequacy[],
    originalRoutine: Routine,
    exerciseExecutions: TExerciseExecution[],
  ): Promise<RoutineAdjustedDifficulty> {
    const new_performance = this.clampValue(
      inference.performance_incr + difficultyData.performance,
      EExplanationVariable.PERFORMANCE,
    );

    const exergame_number_explanation = this.parseExplanation(
      inference.exergame_number_explanation,
    );
    const exergame_explanations: IExerciseExplanations[] =
      inference.exergames_data.map((el, i) => {
        return {
          exerciseId: exerciseExecutions[i].exercise.id,
          cluster: inference.exergames_data[i].cluster,
          explanations: el.explanations.map((explanation) =>
            this.parseExplanation(explanation),
          ),
        };
      });

    const new_exercise_adequacies: INewExerciseAdequacy[] =
      exerciseAdequacies.map((adequacy, i) => {
        const new_adequacy = this.clampValue(
          inference.exergames_data[i].adequacy_incr + adequacy.adequacy,
          EExplanationVariable.ADEQUACY,
        );
        return {
          exerciseId: adequacy.exercise.id,
          adequacy: new_adequacy,
        };
      });

    const new_exercise_configurations =
      await this.generateNewExerciseConfigurations(
        em,
        inference,
        exerciseExecutions,
        originalRoutine.id,
        new_performance,
      );

    const routineAdjustedDifficulty = await em
      .getRepository(RoutineAdjustedDifficulty)
      .createQueryBuilder('rad')
      .leftJoinAndSelect('rad.original_routine', 'routine')
      .where('routine.id = :routineId', {
        routineId: originalRoutine.id,
      })
      .getOne();

    if (isDefined(routineAdjustedDifficulty)) {
      routineAdjustedDifficulty.new_performance = new_performance;
      routineAdjustedDifficulty.new_exercise_adequacies =
        new_exercise_adequacies;
      routineAdjustedDifficulty.new_exercise_configurations =
        new_exercise_configurations;
      routineAdjustedDifficulty.exergame_number_explanation =
        exergame_number_explanation;
      routineAdjustedDifficulty.exergame_explanations = exergame_explanations;
      routineAdjustedDifficulty.cluster_representative_exergame_ids =
        inference.representative_indexes.reduce((acc, curr) => {
          const exercise = exerciseExecutions[curr].exercise;
          const cluster = inference.exergames_data[curr].cluster;
          acc[cluster] = exercise.id;
          return acc;
        }, {});

      await em
        .getRepository(RoutineAdjustedDifficulty)
        .update(routineAdjustedDifficulty.id, routineAdjustedDifficulty);
      return routineAdjustedDifficulty;
    } else {
      return await em.getRepository(RoutineAdjustedDifficulty).save(
        em.getRepository(RoutineAdjustedDifficulty).create({
          original_routine: originalRoutine,
          new_performance,
          new_exercise_adequacies,
          new_exercise_configurations,
          exergame_number_explanation,
          exergame_explanations,
          cluster_representative_exergame_ids:
            inference.representative_indexes.reduce((acc, curr) => {
              const exercise = exerciseExecutions[curr].exercise;
              const cluster = inference.exergames_data[curr].cluster;
              acc[cluster] = exercise.id;
              return acc;
            }, {}),
        }),
      );
    }
  }

  private async generateNewExerciseConfigurations(
    em: EntityManager,
    inference: TRoutineInference,
    exerciseExecutions: TExerciseExecution[],
    routineId: string,
    performance: number,
  ): Promise<INewExerciseConfiguration[]> {
    const newExerciseConfigurations: INewExerciseConfiguration[] = [];

    const patient = await em
      .getRepository(Patient)
      .createQueryBuilder('patient')
      .leftJoinAndSelect('patient.routine', 'routine')
      .where('routine.id = :routineId', { routineId })
      .getOne();

    const newRoutineExercises = await em
      .getRepository(Exercise)
      .createQueryBuilder('exercise')
      .leftJoinAndSelect('exercise.routine_to_exercise', 'rte')
      .leftJoinAndSelect('rte.routine', 'routine')
      .leftJoinAndSelect('exercise.exercise_adequacy', 'exercise_adequacy')
      .where('routine.id = :routineId')
      .andWhere(
        new Brackets((qb) => {
          qb.where('exercise.stroke_side = :bilateralSide')
            .orWhere(':patientStrokeSide = :bilateralSide')
            .orWhere('exercise.stroke_side = :patientStrokeSide');
        }),
      )
      .setParameters({
        patientStrokeSide: patient.stroke_side,
        bilateralSide: EStrokeSide.Bilateral,
        routineId,
      })
      .orderBy('exercise_adequacy.adequacy', 'DESC', 'NULLS LAST')
      .take(
        this.clampValue(
          inference.exergame_number,
          EExplanationVariable.EXERGAME_NUMBER,
        ),
      )
      .getMany();

    for (const newRoutineExercise of newRoutineExercises) {
      let newExerciseConfiguration: INewExerciseConfiguration;
      const exerciseIndex = exerciseExecutions.findIndex(
        (exec) => exec.exercise.id === newRoutineExercise.id,
      );

      if (exerciseIndex <= -1) {
        // Add new exercise with default parameters depending on the performance
        if (performance < 0.34) {
          newExerciseConfiguration = {
            exerciseId: newRoutineExercise.id,
            reps: 10,
            sets: 2,
            rest_between_sets: 120,
            time: 110,
          };
        } else if (performance < 0.67) {
          newExerciseConfiguration = {
            exerciseId: newRoutineExercise.id,
            reps: 8,
            sets: 4,
            rest_between_sets: 120,
            time: 110,
          };
        } else {
          newExerciseConfiguration = {
            exerciseId: newRoutineExercise.id,
            reps: 10,
            sets: 5,
            rest_between_sets: 120,
            time: 90,
          };
        }
      } else {
        // Adjust old exercise
        const exergame_data = inference.exergames_data[exerciseIndex];
        const routineToExercise = newRoutineExercise.routine_to_exercise[0];
        const sets = this.clampValue(
          routineToExercise.sets + exergame_data.set_incr,
          EExplanationVariable.SETS,
        );
        const reps =
          sets === 0
            ? 0
            : this.clampValue(
                (routineToExercise.sets * routineToExercise.reps +
                  exergame_data.rep_incr) /
                  sets,
                EExplanationVariable.REPS,
              );
        const time = this.clampValue(
          routineToExercise.time + exergame_data.time_incr,
          EExplanationVariable.TIME,
        );

        newExerciseConfiguration = {
          exerciseId: newRoutineExercise.id,
          rest_between_sets: routineToExercise.rest_between_sets,
          reps,
          sets,
          time,
        };
      }

      newExerciseConfigurations.push(newExerciseConfiguration);
    }

    return newExerciseConfigurations;
  }

  async getRoutineDifficultyAdjustment(
    routineId: string,
    user: FullUserDto,
  ): Promise<RoutineAdjustedDifficulty> {
    const { manager } = this.connection;

    const routineAdjustedDifficulty = await manager
      .getRepository(RoutineAdjustedDifficulty)
      .createQueryBuilder('rad')
      .leftJoinAndSelect('rad.original_routine', 'routine')
      .leftJoinAndSelect('routine.therapist', 'therapist')
      .where('routine.id = :routineId', { routineId })
      .getOne();

    if (!isDefined(routineAdjustedDifficulty)) {
      return null;
    }

    await this.checkIfUserCanAdjustRoutine(
      routineAdjustedDifficulty.original_routine,
      user,
      manager,
    );
    return this.loadExercises(routineAdjustedDifficulty);
  }

  private async loadExercises(
    routineAdjustedDifficulty: RoutineAdjustedDifficulty,
    em?: EntityManager,
  ): Promise<RoutineAdjustedDifficulty> {
    const manager = em ? em : this.connection.manager;

    await Promise.all(
      routineAdjustedDifficulty.new_exercise_configurations.map(
        async (exerciseConfiguration) => {
          exerciseConfiguration.exercise = await manager
            .getRepository(Exercise)
            .findOne(exerciseConfiguration.exerciseId);
        },
      ),
    );
    return routineAdjustedDifficulty;
  }

  async acceptDifficultyAdjustment(
    routineId: string,
    user: FullUserDto,
  ): Promise<void> {
    const { manager } = this.connection;

    await manager.transaction(async (em) => {
      const routine = await this.getRoutineQuery(em)
        .leftJoinAndSelect('routine.routine_adjusted_difficulty', 'rad')
        .leftJoinAndSelect('patient.difficulty_data', 'difficulty_data')
        .where('routine.id = :routineId', { routineId })
        .getOne();
      await this.checkIfUserCanAdjustRoutine(routine, user, em);

      const adjustedDifficulty = routine.routine_adjusted_difficulty;
      const patientDifficulty = routine.patients[0].difficulty_data;

      patientDifficulty.performance = adjustedDifficulty.new_performance;
      patientDifficulty.last_inference = new Date().toISOString();
      em.getRepository(PatientDifficultyData).update(
        patientDifficulty.id,
        patientDifficulty,
      );

      await Promise.all(
        routine.routine_to_exercise.map(async (routineToExercise) => {
          await em.getRepository(RoutineToExercise).delete(routineToExercise);
        }),
      );
      routine.routine_to_exercise = await Promise.all(
        adjustedDifficulty.new_exercise_configurations.map(async (config) => {
          const routineToExercise = em.getRepository(RoutineToExercise).create({
            routine: routine,
            exercise: { id: config.exerciseId },
            sets: config.sets,
            reps: config.reps,
            time: config.time,
            rest_between_sets: config.rest_between_sets,
          });

          return em.getRepository(RoutineToExercise).save(routineToExercise);
        }),
      );

      await Promise.all(
        adjustedDifficulty.new_exercise_adequacies.map(async (newAdequacy) => {
          const oldAdequacy = await em
            .getRepository(ExerciseAdequacy)
            .createQueryBuilder('adequacy')
            .leftJoinAndSelect('adequacy.difficulty_data', 'difficulty_data')
            .leftJoinAndSelect('adequacy.exercise', 'exercise')
            .where('difficulty_data.id = :difficultyDataId', {
              difficultyDataId: patientDifficulty.id,
            })
            .andWhere('exercise.id = :exerciseId', {
              exerciseId: newAdequacy.exerciseId,
            })
            .getOne();

          oldAdequacy.adequacy = newAdequacy.adequacy;
          await em.getRepository(ExerciseAdequacy).save(oldAdequacy);
        }),
      );

      await em
        .getRepository(RoutineAdjustedDifficulty)
        .delete(routine.routine_adjusted_difficulty.id);
    });
  }

  async discardDifficultyAdjustment(
    routineId: string,
    user: FullUserDto,
  ): Promise<void> {
    const { manager } = this.connection;

    await manager.transaction(async (em) => {
      const routine = await this.getRoutineQuery(em)
        .leftJoinAndSelect('routine.routine_adjusted_difficulty', 'rad')
        .where('routine.id = :routineId', { routineId })
        .getOne();
      await this.checkIfUserCanAdjustRoutine(routine, user, em);
      await em
        .getRepository(RoutineAdjustedDifficulty)
        .delete(routine.routine_adjusted_difficulty.id);
    });
  }
}
