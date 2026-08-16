import { GetSummarizedStatisticsDto } from '@common-request-dto/get-summarized-statistics.dto';
import {
  IPatientSummarizedStatistics,
  ISummarizedStatistics,
} from '@common-response-dto-interfaces/summarized-statistics.interface';
import { FullUserDto } from '@common-response-dto/full-user.dto';
import { SummarizedStatisticsDto } from '@common-response-dto/summarized-statistics.dto';
import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { differenceInDays } from 'date-fns';
import { Routine, User } from 'src/database/entity';
import { Patient } from 'src/database/entity/patient.entity';
import { Connection } from 'typeorm';

@Injectable()
export class StatisticsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async getSummarizedStatistics(
    dto: GetSummarizedStatisticsDto,
    user: FullUserDto,
  ): Promise<ISummarizedStatistics> {
    const { manager } = this.connection;

    const year: number = new Date().getUTCFullYear();
    const month: number = new Date().getUTCMonth();

    const lastMonthDate: Date = new Date();
    lastMonthDate.setDate(0);

    const lastYear: number = lastMonthDate.getUTCFullYear();
    const lastMonth: number = lastMonthDate.getUTCMonth();

    const outputDto: ISummarizedStatistics = {};

    if (dto.patientStatistics) {
      const patients = await manager
        .getRepository(Patient)
        .createQueryBuilder('patient')
        .leftJoinAndSelect('patient.therapist', 'therapist')
        .leftJoinAndSelect('patient.user', 'user')
        .leftJoinAndSelect('patient.routine', 'routine')
        .leftJoinAndSelect(
          'patient.routine_execution_data',
          'routine_execution_data',
        )
        .where('patient.therapist.id = :therapistId', {
          therapistId: user.id,
        })
        .getMany();

      let newPatientsThisMonth = 0;
      let newPatientsLastMonth = 0;
      let newPatientsThisYear = 0;
      let newPatientsLastYear = 0;
      for (const patient of patients) {
        if (patient) {
          if (patient.audit_dates && patient.audit_dates.created_at) {
            if (
              patient.audit_dates.created_at.getUTCFullYear() === year &&
              patient.audit_dates.created_at.getUTCMonth() === month
            ) {
              newPatientsThisMonth++;
            } else if (
              patient.audit_dates.created_at.getUTCFullYear() === lastYear &&
              patient.audit_dates.created_at.getUTCMonth() === lastMonth
            ) {
              newPatientsLastMonth++;
            }

            if (patient.audit_dates.created_at.getUTCFullYear() === year) {
              newPatientsThisYear++;
            } else if (
              patient.audit_dates.created_at.getUTCFullYear() ===
              year - 1
            ) {
              newPatientsLastYear++;
            }
          }
        }
      }
      outputDto.patientStatistics = {
        numberOfPatients: patients.length,
        newPatientsThisMonth: newPatientsThisMonth,
        newPatientsLastMonth: newPatientsLastMonth,
        newPatientsThisYear: newPatientsThisYear,
        newPatientsLastYear: newPatientsLastYear,
      };
    }

    if (dto.routineStatistics) {
      const routines = await manager
        .getRepository(Routine)
        .createQueryBuilder('routine')
        .leftJoin('routine.therapist', 'therapist')
        .where('therapist.id = :therapistId', {
          therapistId: user.id,
        })
        .getMany();

      outputDto.routineStatistics = {
        numberOfRoutines: routines.length,
      };
    }

    if (dto.therapistStatistics) {
      const therapist = await manager
        .getRepository(User)
        .createQueryBuilder('user')
        .leftJoinAndSelect('user.pricing_plan', 'pricing_plan')
        .where('user.id = :therapistId', {
          therapistId: user.id,
        })
        .getOne();

      outputDto.therapistStatistics = {
        numberOfDaysSinceRegistration: differenceInDays(
          new Date(),
          new Date(therapist.audit_dates.created_at),
        ),
        princingPlan: therapist.pricing_plan && therapist.pricing_plan.type,
      };
    }

    return outputDto;
  }
}
