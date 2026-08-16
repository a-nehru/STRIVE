import {
  MovementCompensation,
  UpsertRoutineProgressDto,
} from '@common-request-dto/upsert-routine-progress';
import { UpsertRoutineDto } from '@common-request-dto/upsert-routine.dto';
import { FullPatientDto } from '@common-response-dto/full-patient.dto';
import { FullUserDto } from '@common-response-dto/full-user.dto';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { isDefined } from 'class-validator';
import {
  Exercise,
  Patient,
  Routine,
  RoutineExecutionData,
  RoutineToExercise,
} from 'src/database/entity';
import { Connection, EntityManager, SelectQueryBuilder } from 'typeorm';
import { AppError } from '../errors/app-error.exception';

type TMetric = 'speed' | 'compensation' | 'time' | 'mistakes';
@Injectable()
export class RoutinesService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  /**
   * Convenient method to check if some routine can be accessed by the provided user
   * ALWAYS CHECK THIS BEFORE RETURNING ANY ROUTINE DATA
   * @param routine the routine
   * @param user the user
   * @returns true if the user can access this routine
   */
  private checkIfUserCanAccessRoutine(
    routine: Routine,
    user: FullUserDto,
  ): boolean {
    if (routine.therapist.id !== user.id) {
      throw new AppError({
        message: `You don't have permission to access this routine`,
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
      .leftJoinAndSelect('routine.routine_to_exercise', 'routine_to_exercise')
      .leftJoinAndSelect('routine_to_exercise.exercise', 'exercise');
  }

  async upsertRoutine(
    dto: UpsertRoutineDto,
    user: FullUserDto,
    id?: string,
  ): Promise<Routine> {
    const { manager } = this.connection;

    return await manager.transaction(async (em) => {
      let routine: Routine;

      if (isDefined(id)) {
        routine = await this.getRoutineQuery(em)
          .where('routine.id = :id', { id })
          .getOne();
        if (!routine) {
          throw new AppError({
            message: `No routine data was found for ID ${id}`,
          });
        }

        this.checkIfUserCanAccessRoutine(routine, user);

        // Clear exercises
        for (const routine_to_exercise of routine.routine_to_exercise) {
          await em.getRepository(RoutineToExercise).delete(routine_to_exercise);
        }
      } else {
        routine = em.create(Routine, {
          therapist: { id: user.id },
        });
      }

      // Update routine data
      routine.name = dto.name;
      routine.start_date = dto.start_date;
      routine.end_date = dto.end_date;
      routine.repetition_weekdays = dto.repetition_weekdays;

      if (!isDefined(id)) {
        routine = await em.getRepository(Routine).save(routine);
      }

      // Save exercises
      routine.routine_to_exercise = [];
      for (const exerciseData of dto.routine_to_exercise) {
        const exercise = await em
          .getRepository(Exercise)
          .createQueryBuilder('exercise')
          .where('exercise.id = :id', { id: exerciseData.exercise_id })
          .getOne();
        if (!exercise) {
          throw new AppError({
            message: `No exercise data was found for ID ${exerciseData.exercise_id}`,
          });
        }
        const routineToExercise = await em
          .getRepository(RoutineToExercise)
          .save(
            em.create(RoutineToExercise, {
              routine: routine,
              exercise: exercise,
              time: exerciseData.time,
              rest_between_sets: exerciseData.rest_between_sets,
              sets: exerciseData.sets,
              reps: exerciseData.reps,
            }),
          );
        routine.routine_to_exercise.push(routineToExercise);
      }

      return await em.getRepository(Routine).save(routine);
    });
  }

  async deleteRoutine(id: string, user: FullUserDto): Promise<Routine> {
    const { manager } = this.connection;

    const routine = await this.getRoutineQuery(manager)
      .where('routine.id = :id', { id })
      .getOne();

    if (!routine) {
      throw new AppError({ message: `No routine data was found for ID ${id}` });
    }

    this.checkIfUserCanAccessRoutine(routine, user);
    await manager.getRepository(Routine).delete({ id: routine.id });
    return routine;
  }

  async getRoutine(id: string, user: FullUserDto): Promise<Routine> {
    const routine = await this.getRoutineQuery()
      .where('routine.id = :id', { id })
      .getOne();
    if (!routine) {
      throw new AppError({ message: `No routine data was found for ID ${id}` });
    }

    this.checkIfUserCanAccessRoutine(routine, user);

    return routine;
  }

  async getPatientRoutine(
    patient: FullPatientDto,
    loadExecutionData = false,
  ): Promise<Routine> {
    const loadedPatient = await this.connection.manager
      .getRepository(Patient)
      .createQueryBuilder('patient')
      .leftJoinAndSelect('patient.routine', 'routine')
      .where('patient.id = :patientId', { patientId: patient.id })
      .getOne();

    if (!loadedPatient || !loadedPatient.routine) {
      throw new AppError({
        message: `No routine data was found for this patient`,
      });
    }

    const routineQuery = this.getRoutineQuery();

    if (loadExecutionData) {
      routineQuery
        .leftJoinAndSelect(
          'routine.routine_execution_data',
          'routine_execution_data',
        )
        .leftJoinAndSelect(
          'routine_execution_data.exercise',
          'execution_data_exercise',
        )
        .leftJoinAndSelect(
          'routine_execution_data.patient',
          'routine_execution_data_patient',
        );
    }

    const routine = await routineQuery
      .where('routine.id = :id', { id: loadedPatient.routine.id })
      .getOne();
    if (!routine) {
      throw new AppError({
        message: `No routine data was found for this patient`,
      });
    }

    return routine;
  }

  async upsertRoutineProgress(
    patient: FullPatientDto,
    dto: UpsertRoutineProgressDto,
  ): Promise<RoutineExecutionData> {
    const { manager } = this.connection;

    const patientRoutine = await this.getPatientRoutine(patient, true);
    const exercise = await manager.findOne(Exercise, dto.exerciseId);
    const { compensation, fatigue } = this.calculateMetrics(dto);

    if (
      !patientRoutine.routine_execution_data ||
      patientRoutine.routine_execution_data.length === 0
    ) {
      await manager.getRepository(RoutineExecutionData).save(
        manager.create(RoutineExecutionData, {
          patient: manager.create(Patient, { id: patient.id }),
          routine: patientRoutine,
          exercise,
          current_set: dto.currentSet,
          completion_time: Math.round(dto.completionTime),
          compensation,
          fatigue,
          waypoint_timestamps: dto.waypointTimestamps,
        }),
      );
    } else {
      // There is a single entity for each patient, for each day,
      // for each routine and for each set within each exercise
      const executionData = patientRoutine.routine_execution_data.find(
        (item) =>
          item.patient &&
          item.patient.id === patient.id &&
          item.exercise &&
          item.exercise.id == dto.exerciseId &&
          item.current_set == dto.currentSet &&
          item.create_date.getDay() == new Date().getDay() &&
          item.create_date.getMonth() == new Date().getMonth() &&
          item.create_date.getFullYear() == new Date().getFullYear(),
      );

      if (!executionData) {
        await manager.getRepository(RoutineExecutionData).save(
          manager.create(RoutineExecutionData, {
            patient: manager.create(Patient, { id: patient.id }),
            routine: patientRoutine,
            exercise,
            current_set: dto.currentSet,
            completion_time: Math.round(dto.completionTime),
            completion: dto.completion,
            reps: dto.reps,
            compensation,
            fatigue,
            waypoint_timestamps: dto.waypointTimestamps,
          }),
        );
      } else {
        await manager.getRepository(RoutineExecutionData).update(
          { id: executionData.id },
          {
            completion_time: Math.round(dto.completionTime),
            completion: dto.completion,
            reps: dto.reps,
            compensation,
            fatigue,
            waypoint_timestamps: dto.waypointTimestamps,
          },
        );
      }
    }

    return await this.getRoutineProgress(patient);
  }

  private calculateMetrics(dto: UpsertRoutineProgressDto): {
    compensation: number;
    fatigue: number;
  } {
    const flattenedCompensations = dto.movementCompensations.reduce(
      (acc, val) => {
        return acc.concat(
          val.reduce((innerAcc, innerVal) => innerAcc.concat(innerVal), []),
        );
      },
      [] as MovementCompensation[],
    );
    const compensations = dto.movementCompensations.map((list) => {
      return this.aggregateCompensationData(
        list.map((el) => ({
          mean: el.compensation,
          validity: el.validity,
        })),
        0.5,
      );
    });
    const compensation =
      this.aggregateCompensationData(
        flattenedCompensations.map((el) => ({
          mean: el.compensation,
          validity: el.validity,
        })),
        0.5,
      ) || 0;

    if (dto.repetitionTimes.length <= 1) {
      return { compensation, fatigue: 0 };
    }

    const speedFatigue = this.getFatigue(dto.movementSpeeds);
    const compensationFatigue = this.getFatigue(compensations);
    const timeFatigue = this.getFatigue(dto.repetitionTimes);
    const mistakesFatigue = this.getFatigue(dto.repetitionMistakes);

    const metricFatigues: {
      [key in TMetric]: number;
    }[] = new Array(dto.movementSpeeds.length).fill({
      speed: 0,
      time: 0,
      compensation: 0,
      mistakes: 0,
    } as {
      [key in TMetric]: number;
    });
    for (let i = 0; i < dto.movementSpeeds.length; i++) {
      metricFatigues[i] = {
        speed: speedFatigue[i],
        time: timeFatigue[i],
        compensation: compensationFatigue[i],
        // TODO penalizations differently ?
        mistakes: mistakesFatigue[i],
      };
    }
    const seriesFatigues = [];
    for (const fatigue of metricFatigues) {
      const fatigueValues = Object.values(fatigue);
      const weights = this.getWeights(fatigueValues);
      const sortedValues = fatigueValues.slice().sort((a, b) => b - a);
      const finalFatigue = sortedValues
        .map((value, i) => value * weights[i])
        .reduce((acc, val) => acc + val, 0);
      seriesFatigues.push(finalFatigue);
    }
    const REMOVE_LOWEST_PERCENTAGE = 0.05;
    const filteredFatigues = seriesFatigues
      .slice()
      .sort((a, b) => a - b)
      .slice(Math.floor(seriesFatigues.length * REMOVE_LOWEST_PERCENTAGE));
    const fatigueOverOne =
      filteredFatigues.reduce((acc, val) => acc + val, 0) /
        filteredFatigues.length || 0;
    const fatigueClamped = Math.max(Math.min(fatigueOverOne, 1), 0);
    const fatigue = Math.floor(fatigueClamped * 100);
    return { compensation, fatigue };
  }

  getFatigue(metricValues: number[]): number[] {
    const RATIO = 0.2;
    const referenceValueCount = Math.floor(metricValues.length * RATIO) || 1;
    const referenceValue =
      metricValues
        .slice(0, referenceValueCount)
        .reduce((acc, speed) => acc + speed, 0) / referenceValueCount;
    const fatigues: number[] = new Array(metricValues.length).fill(0);
    for (let i = 0; i < metricValues.length; i++) {
      const fatigue =
        (Math.abs(metricValues[i] - referenceValue) / referenceValue) * 100;
      const m1 = this.membershipTrapezium(fatigue, 0, 0, 15, 30);
      const m2 = this.membershipTriangle(fatigue, 15, 30, 40);
      const m3 = this.membershipTriangle(fatigue, 30, 40, 60);
      const m4 = this.membershipTrapezium(fatigue, 40, 60, 100, 100);
      const total = m1 * 0.1 + m2 * 0.3 + m3 * 0.4 + m4 * 0.6;
      fatigues[i] = Math.min(total, 1);
    }
    return fatigues;
  }

  getWeights(fatigueValues: number[]): number[] {
    // TODO review algorithm
    let newWeights: number[] = [];
    let accumulatedNewWeights = 0;
    let evaluated = false;
    const ABNORMAL_FATIGUE = 0.7;
    const OWA_WEIGHTS = [0.5, 0.3, 0.1, 0.05, 0.05];

    for (const fatigue of fatigueValues) {
      if (fatigue > ABNORMAL_FATIGUE && !evaluated) {
        evaluated = true;
        for (const weight of OWA_WEIGHTS) {
          const B = 1 - 2 * weight;
          if (B <= 0) {
            newWeights.push(fatigue);
            accumulatedNewWeights += fatigue;
          } else {
            newWeights.push(fatigue + B);
            accumulatedNewWeights += fatigue + B;
          }
        }

        for (let i = 0; i < newWeights.length; i++) {
          newWeights[i] = parseFloat(
            (newWeights[i] / accumulatedNewWeights).toFixed(3),
          );
        }
      }
    }

    if (newWeights.length === 0) {
      newWeights = OWA_WEIGHTS;
    }

    return newWeights;
  }

  // Trapezoidal membership function
  membershipTrapezium(
    x: number,
    a: number,
    b: number,
    c: number,
    d: number,
  ): number {
    if (x <= a || x >= d) {
      return 0; // outside the trapezoid
    }
    if (x >= b && x <= c) {
      return 1; // plateau in the middle
    }
    if (x > a && x < b) {
      return (x - a) / (b - a); // rising slope
    }
    if (x > c && x < d) {
      return (d - x) / (d - c); // falling slope
    }
    return 0; // Shouldn't happen but just in case
  }

  // Triangular membership function
  membershipTriangle(x: number, a: number, b: number, c: number): number {
    if (x <= a || x >= c) {
      return 0; // outside the triangle
    }
    if (x === b) {
      return 1; // peak of the triangle
    }
    if (x > a && x < b) {
      return (x - a) / (b - a); // rising slope
    }
    if (x > b && x < c) {
      return (c - x) / (c - b); // falling slope
    }
    return 0; // Shouldn't happen but just in case
  }

  async getRoutineProgress(
    patient: FullPatientDto,
  ): Promise<RoutineExecutionData> {
    const patientRoutine = await this.getPatientRoutine(patient, true);

    if (
      !patientRoutine.routine_execution_data ||
      patientRoutine.routine_execution_data.length === 0
    ) {
      throw new AppError({
        message: `No progress was found for this routine`,
      });
    }
    const executionData = patientRoutine.routine_execution_data.find(
      (item) => item.patient && item.patient.id === patient.id,
    );

    if (!executionData) {
      throw new AppError({
        message: `No routine progress was found for this patient`,
      });
    }

    return executionData;
  }

  private aggregateCompensationData(
    data: { mean: number; validity: number }[],
    alpha: number,
  ): number {
    type TFuzzySet = { [key: number]: number };
    type TMatrix<T> = { [key: number]: { [key: number]: T } };
    // Create fuzzy number, where the mean has membership 1 as the distance
    // from the mean increases the membership decreases linearly until mean +- range = 0
    const createFuzzyNumber = (mean: number, validity: number) => {
      const fuzzyNumber: TFuzzySet = {};
      const cappedMean = Math.min(Math.max(mean, 0), 100);
      const range = Math.min(
        Math.max(
          (10 * (1 - validity)) / (1 - 0.98) + (validity - 0.98) / (1 - 0.98),
          1,
        ),
        10,
      );
      for (let i = 0; i <= 100; i++) {
        fuzzyNumber[i] = Math.max(
          0,
          (range - Math.abs(cappedMean - i)) / range,
        );
      }
      return fuzzyNumber;
    };
    const fuzzy0 = createFuzzyNumber(0, 100);
    const fuzzyNumbers = data.map((el) =>
      createFuzzyNumber(el.mean * 10, el.validity),
    );

    const fuzzyMin = (a_j: TFuzzySet, a_k: TFuzzySet) => {
      const fuzzyMin: TFuzzySet = {};

      for (let i = 0; i <= 100; i++) {
        const pairs = [];
        for (let j = i; j <= 100; j++) {
          pairs.push([i, j]);
        }
        for (let j = i + 1; j <= 100; j++) {
          pairs.push([j, i]);
        }
        fuzzyMin[i] = Math.max(
          ...pairs.map((pair) => Math.min(a_j[pair[0]], a_k[pair[1]])),
        );
      }
      return fuzzyMin;
    };

    const fuzzySIM = (f1: TFuzzySet, f2: TFuzzySet) => {
      const numerator = Object.keys(f1).reduce(
        (acc, key) => acc + Math.min(f1[key], f2[key]),
        0,
      );
      const denominator = Object.keys(f1).reduce(
        (acc, key) => acc + Math.max(f1[key], f2[key]),
        0,
      );
      if (!denominator) {
        return 1;
      }
      return numerator / denominator;
    };

    const getFuzzyP = (
      fuzzySets: TFuzzySet[],
      fuzzyMins: TMatrix<TFuzzySet>,
      j: number,
      k: number,
    ) => {
      return fuzzySIM(fuzzySets[j], fuzzyMins[j][k]);
    };

    const mapToMatrix = <T>(n: number, f: (i: number, j: number) => T) => {
      const matrix: TMatrix<T> = {};
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (!matrix[i]) {
            matrix[i] = {};
          }
          matrix[i][j] = f(i, j);
        }
      }
      return matrix;
    };

    const rank = (
      fuzzySets: TFuzzySet[],
      fuzzyPs: TMatrix<number>,
      k: number,
    ) => {
      let rank = 0.5;
      for (let j = 0; j < fuzzySets.length; j++) {
        rank += fuzzyPs[j][k] / (fuzzyPs[j][k] + fuzzyPs[k][j]);
      }
      return rank;
    };

    const getT = (ranks: number[], i: number) => {
      const isC0 = (j: number, x: number) => x < ranks[j] - 1;
      const isC1 = (j: number, x: number) => x > ranks[j] + 1;

      let limits = [];
      for (let j = 0; j < ranks.length; j++) {
        limits.push(ranks[j] - 1);
        limits.push(ranks[j] + 1);
      }
      limits.sort((a, b) => a - b);
      limits = limits.filter((el, i) => limits.indexOf(el) === i);

      for (let k = 1; k < limits.length; k++) {
        // Considering range [limits[k-1], limits[k]]
        const midpoint = (limits[k - 1] + limits[k]) / 2;
        const countIsNotC0C1 = ranks.filter(
          (_, j) => !isC0(j, midpoint) && !isC1(j, midpoint),
        ).length;
        if (countIsNotC0C1 <= 0) {
          continue;
        }
        const countIsC1 = ranks.filter((_, j) => isC1(j, midpoint)).length;
        const sumRanks = ranks
          .map((_, j) =>
            isC0(j, midpoint) || isC1(j, midpoint) ? 0 : ranks[j],
          )
          .reduce((acc, el) => acc + el, 0);
        const candidateValue =
          -1 + (2 * (i + 1) + sumRanks - 2 * countIsC1 - 1) / countIsNotC0C1;
        if (candidateValue >= limits[k - 1] && candidateValue <= limits[k]) {
          return candidateValue;
        }
      }

      return null;
    };

    const cloneMatrix = <T>(matrix: TMatrix<T>) => {
      const clone: TMatrix<T> = {};
      for (const row in matrix) {
        clone[row] = { ...matrix[row] };
      }
      return clone;
    };

    const compareMatrices = (m1: TMatrix<number>, m2: TMatrix<number>) => {
      if (Object.keys(m1).length !== Object.keys(m2).length) {
        return false;
      }
      for (const row in m1) {
        if (Object.keys(m1[row]).length !== Object.keys(m2[row]).length) {
          return false;
        }
        for (const col in m1[row]) {
          if (Math.abs(m1[row][col] - m2[row][col]) > 0.0001) {
            return false;
          }
        }
      }
      return true;
    };

    const fuzzyProduct = (fuzzySet: TFuzzySet, scalar: number) => {
      const result: TFuzzySet = {};
      for (const i in fuzzySet) {
        if (fuzzySet.hasOwnProperty(i)) {
          result[i] = fuzzySet[i] * scalar;
        }
      }
      return result;
    };

    const fuzzySum = (fuzzySetA: TFuzzySet, fuzzySetB: TFuzzySet) => {
      const result: TFuzzySet = {};
      for (const i in fuzzySetA) {
        if (fuzzySetA.hasOwnProperty(i) && fuzzySetB.hasOwnProperty(i)) {
          result[i] = fuzzySetA[i] + fuzzySetB[i];
        }
      }
      return result;
    };

    const applyPermutationMatrix = (
      matrix: TMatrix<number>,
      vector: TFuzzySet[],
    ) => {
      const sortedVector: TFuzzySet[] = [];
      for (let i = 0; i < vector.length; i++) {
        const row = matrix[i];
        const sortedElement = vector
          .map((el, j) => fuzzyProduct(el, row[j]))
          .reduce((acc, el) => fuzzySum(acc, el), fuzzy0);
        sortedVector.push(sortedElement);
      }
      return sortedVector;
    };

    const centerOfGravityDefuzzification = (fuzzySet: TFuzzySet) => {
      const numerator = Object.keys(fuzzySet).reduce(
        (acc, key) => acc + Number(key) * fuzzySet[key],
        0,
      );
      const denominator = Object.keys(fuzzySet).reduce(
        (acc, key) => acc + fuzzySet[key],
        0,
      );
      return numerator / denominator;
    };

    const fuzzyMins = mapToMatrix(fuzzyNumbers.length, (i, j) =>
      fuzzyMin(fuzzyNumbers[i], fuzzyNumbers[j]),
    );
    const fuzzyPs = mapToMatrix(fuzzyNumbers.length, (i, j) =>
      getFuzzyP(fuzzyNumbers, fuzzyMins, i, j),
    );

    const ranks = fuzzyNumbers.map((_, i) => rank(fuzzyNumbers, fuzzyPs, i));

    let permutationMatrix: TMatrix<number> = {};
    for (let i = 0; i < fuzzyNumbers.length; i++) {
      for (let j = 0; j < fuzzyNumbers.length; j++) {
        if (!permutationMatrix[i]) {
          permutationMatrix[i] = {};
        }
        permutationMatrix[i][j] = Math.max(
          0,
          1 - Math.abs(ranks[j] - getT(ranks, i)),
        );
      }
    }

    let isConverged = false;
    let matrixA = cloneMatrix(permutationMatrix);
    while (!isConverged) {
      // Normalize rows
      const matrixB = cloneMatrix(matrixA);
      for (const row in matrixB) {
        const rowSum = Object.values(matrixB[row]).reduce(
          (acc, value) => acc + value,
          0,
        );
        for (const col in matrixB[row]) {
          matrixB[row][col] /= rowSum;
        }
      }
      const newMatrixA = cloneMatrix(matrixB);
      // Normalize columns
      for (let i = 0; i < Object.values(newMatrixA[0]).length; i++) {
        const colSum = Object.values(newMatrixA).reduce(
          (acc, value) => acc + value[i],
          0,
        );
        for (const row in newMatrixA) {
          newMatrixA[row][i] /= colSum;
        }
      }
      isConverged = compareMatrices(matrixA, newMatrixA);
      matrixA = newMatrixA;
    }
    permutationMatrix = matrixA;

    const fuzzyNumbersSorted = applyPermutationMatrix(
      permutationMatrix,
      fuzzyNumbers,
    );
    fuzzyNumbersSorted.reverse();

    const defuzzifiedValues = fuzzyNumbersSorted.map((fuzzyNumber) =>
      centerOfGravityDefuzzification(fuzzyNumber),
    );

    // OR-like OWA
    const weights = Array.from({ length: data.length }, (_, i) =>
      i ? (1 - alpha) / data.length : alpha + (1 - alpha) / data.length,
    );

    const aggregatedValue = defuzzifiedValues
      .map((el, i) => el * weights[i])
      .reduce((acc, el) => acc + el, 0);

    return Math.floor(aggregatedValue);
  }
}
