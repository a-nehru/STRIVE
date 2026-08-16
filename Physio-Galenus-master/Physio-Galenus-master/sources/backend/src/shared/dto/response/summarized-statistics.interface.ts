import { EPricingPlanType } from '@common-enums/pricing-plan-type.enum';

export interface ISummarizedStatistics {
  patientStatistics?: IPatientSummarizedStatistics;
  routineStatistics?: IRoutineSummarizedStatistics;
  therapistStatistics?: ITherapistSummarizedStatistics;
}

export interface IPatientSummarizedStatistics {
  numberOfPatients: number;
  newPatientsThisMonth: number;
  newPatientsThisYear: number;
  newPatientsLastYear: number;
  newPatientsLastMonth: number;
}

export interface IRoutineSummarizedStatistics {
  numberOfRoutines: number;
}

export interface ITherapistSummarizedStatistics {
  numberOfDaysSinceRegistration: number;
  princingPlan: EPricingPlanType;
}
