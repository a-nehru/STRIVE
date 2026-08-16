import { EGender } from '@common-enums/gender.enum';
import { IPatientSettings } from '@common-types/patient-settings.interface';
import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/typeorm';
import { generateToken } from 'src/misc/generate-token';
import { UpsertPatientDto } from 'src/common/dto/request/upsert-patient.dto';
import { FullUserDto } from 'src/common/dto/response/full-user.dto';
import { isDefined } from 'src/common/utils/is-defined';
import { envConfig } from '@config/environment.config';
import {
  Patient,
  PatientDifficultyData,
  Routine,
  User,
} from 'src/database/entity';
import { Connection, EntityManager, SelectQueryBuilder } from 'typeorm';
import { AppError } from '../errors/app-error.exception';
import { UpdatePatientSettingsDto } from '@common-request-dto/update-patient-settings.dto';

@Injectable()
export class PatientsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  /**
   * Convenient method to check if some patient can be accessed by the provided user
   * ALWAYS CHECK THIS BEFORE RETURNING ANY PATIENT DATA
   * @param patient the patient
   * @param user the user
   * @returns true if the user can access this patient
   */
  private checkIfUserCanAccessPatient(
    patient: Patient,
    user: FullUserDto,
  ): boolean {
    if (
      !(user?.id == patient?.therapist?.id || user?.id == patient?.user?.id)
    ) {
      throw new AppError({
        message: `You don't have permission to access this patient`,
      });
    }
    return true;
  }

  private getPatientQuery(em?: EntityManager): SelectQueryBuilder<Patient> {
    const manager = em ? em : this.connection.manager;
    return manager
      .getRepository(Patient)
      .createQueryBuilder('patient')
      .leftJoinAndSelect('patient.therapist', 'therapist')
      .leftJoinAndSelect('patient.user', 'user')
      .leftJoinAndSelect('patient.routine', 'routine')
      .leftJoinAndSelect(
        'patient.routine_execution_data',
        'routine_execution_data',
      )
      .leftJoinAndSelect('patient.difficulty_data', 'difficulty_data');
  }

  async upsertPatient(
    dto: UpsertPatientDto,
    user: FullUserDto,
    id?: string,
  ): Promise<Patient> {
    const { manager } = this.connection;

    return await manager.transaction(async (em) => {
      let patient: Patient;
      const qb = this.getPatientQuery(em);

      if (isDefined(id)) {
        patient = await qb.where('patient.id = :id', { id }).getOne();
        if (!patient) {
          throw new AppError({
            message: `No patient data was found for ID ${id}`,
          });
        }

        this.checkIfUserCanAccessPatient(patient, user);
      } else {
        const userEntity = await em
          .getRepository(User)
          .createQueryBuilder('user')
          .leftJoinAndSelect('user.pricing_plan', 'pricing_plan')
          .where('user.id = :userId', { userId: user.id })
          .getOne();

        const patientCount = await em
          .getRepository(Patient)
          .createQueryBuilder('patient')
          .leftJoin('patient.therapist', 'therapist')
          .where('therapist.id = :userId', { userId: user.id })
          .getCount();

        if (
          !(
            userEntity?.pricing_plan?.number_of_supervised_patients >
            patientCount
          )
        ) {
          throw new AppError({
            message: `You have reached the limit of patients you can create`,
            statusCode: HttpStatus.PAYMENT_REQUIRED,
          });
        }

        patient = em.create(Patient, {});
      }

      // Update patient data
      patient.nickname = dto.nickname;
      patient.email = isDefined(dto.email) ? dto.email : null;
      patient.birth_date = isDefined(dto.birth_date)
        ? new Date(dto.birth_date)
        : null;

      patient.gender = dto.gender;
      if (patient.gender === EGender.PreferToSelfDescribe) {
        patient.prefer_to_self_describe_text = dto.prefer_to_self_describe_text;
      } else {
        patient.prefer_to_self_describe_text = null;
      }
      patient.stroke_side = dto.stroke_side;

      if (!isDefined(patient.access_token)) {
        patient.access_token = await this.generateUniqueToken(em);
      }

      if (isDefined(patient.difficulty_data)) {
        patient.difficulty_data.mobility = dto.mobility;
        await em
          .getRepository(PatientDifficultyData)
          .update(patient.difficulty_data.id, patient.difficulty_data);
      } else {
        const difficultyData = await em
          .getRepository(PatientDifficultyData)
          .save(
            em.getRepository(PatientDifficultyData).create({
              performance: 50,
              mobility: dto.mobility,
            }),
          );
        patient.difficulty_data = difficultyData;
      }

      if (dto.routine_id) {
        patient.routine = await em.findOne(Routine, dto.routine_id);
      } else {
        patient.routine = null;
      }

      patient.therapist = em.create(User, { id: user.id });

      const savedPatient = await em.getRepository(Patient).save(patient);

      return await qb
        .where('patient.id = :id', { id: savedPatient.id })
        .getOne();
    });
  }

  async deletePatient(id: string, user: FullUserDto): Promise<Patient> {
    const { manager } = this.connection;

    const qb = this.getPatientQuery(manager);

    const patient = await qb.where('patient.id = :id', { id }).getOne();
    if (!patient) {
      throw new AppError({ message: `No patient data was found for ID ${id}` });
    }

    this.checkIfUserCanAccessPatient(patient, user);

    // If this patient is the demo patient of a therapist we throw an error
    if (isDefined(patient.userId)) {
      throw new AppError({
        message: `This patient can't be deleted`,
        statusCode: HttpStatus.BAD_REQUEST,
      });
    }

    await manager.getRepository(Patient).delete({ id: patient.id });

    return patient;
  }

  async getPatient(id: string, user: FullUserDto): Promise<Patient> {
    const { manager } = this.connection;

    const qb = this.getPatientQuery(manager);

    const patient = await qb.where('patient.id = :id', { id }).getOne();
    if (!patient) {
      throw new AppError({ message: `No patient data was found for ID ${id}` });
    }

    this.checkIfUserCanAccessPatient(patient, user);

    return patient;
  }

  async generateUniqueToken(em?: EntityManager): Promise<string> {
    const manager = em ? em : this.connection.manager;
    for (let i = 0; i < envConfig.maxPatientTokenRetries; i++) {
      const newToken = generateToken(envConfig.patientTokenLength);
      if (isDefined(newToken)) {
        const existingPatient = await manager
          .getRepository(Patient)
          .createQueryBuilder('patient')
          .where('patient.access_token = :newToken', { newToken })
          .getOne();

        if (!existingPatient) {
          return newToken;
        }
      }
    }
    return null;
  }

  async upsertSettings(
    patientId: string,
    updateSettings: UpdatePatientSettingsDto,
    user: FullUserDto,
  ): Promise<Patient> {
    const { manager } = this.connection;

    const updatedSettings = await manager.transaction(async (em) => {
      const usersRepo = em.getRepository(Patient);
      const query = usersRepo.createQueryBuilder('patient');
      const patient = await query
        .where('patient.id = :patientId', { patientId })
        .getOne();
      if (!patient) {
        throw new AppError({ message: `Patient ID (${patientId}) not found` });
      }

      const setting: IPatientSettings = {
        ...updateSettings.settings,
      };

      const updated = await usersRepo.update(
        { id: patient.id },
        {
          settings: {
            ...patient.settings,
            ...setting,
          },
        },
      );

      return updated;
    });

    if (updatedSettings.affected <= 0) {
      throw new AppError({
        message: `Patient (${patientId}) could not be updated`,
      });
    }

    const updatedPatient = await this.getPatient(patientId, user);
    return updatedPatient;
  }
}
