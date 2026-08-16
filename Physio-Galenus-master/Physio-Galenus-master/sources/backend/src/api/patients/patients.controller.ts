import {
  Controller,
  Get,
  UseGuards,
  Request,
  Param,
  Post,
  Body,
  Put,
  Delete,
  UsePipes,
  Query,
  Patch,
} from '@nestjs/common';
import { PatientsService } from './patients.service';
import { CookieAuthenticationGuard } from 'src/guards/cookie-authentication.guard';
import { patientsEndpoint } from '@config/endpoints.config';
import { FullPatientDto } from 'src/common/dto/response/full-patient.dto';
import { plainToClass } from 'class-transformer';
import { UpsertPatientDto } from 'src/common/dto/request/upsert-patient.dto';
import { DeletedPatientDto } from 'src/common/dto/response/deleted-patient.dto';
import { PatientsSearchService } from './patients-search.service';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { PatientDetailsForListDto } from '@common-response-dto/patient-details-for-list.dto';
import { FilterPatientsDto } from '@common-request-dto/filter-patients.dto';
import { makeResponse } from 'src/common/utils/network-utils';
import { PermissionsGuard } from 'src/guards/permissions.guard';
import { EPermission, EPermissionAction } from 'src/common/permissions';
import { Permissions } from 'src/guards/permissions.decorator';
import { UpdatePatientSettingsDto } from '@common-request-dto/update-patient-settings.dto';

@UseGuards(CookieAuthenticationGuard, PermissionsGuard)
@Controller(patientsEndpoint.$full)
export class PatientsController {
  constructor(
    private readonly patientsSearchService: PatientsSearchService,
    private readonly patientsService: PatientsService,
  ) {}

  @Permissions([
    { id: EPermission.ManagePatients, actions: [EPermissionAction.List] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get()
  async list(
    @Request() { user },
    @Query() query: FilterPatientsDto,
  ): Promise<PatientDetailsForListDto> {
    const result = await this.patientsSearchService.list(user, query);
    const patientDetailsForListDto = makeResponse(PatientDetailsForListDto, {
      data: result.entities,
      metadata: result.pagination,
    });
    return patientDetailsForListDto;
  }

  @Permissions([
    { id: EPermission.ManagePatients, actions: [EPermissionAction.Read] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get(`/:patientId`)
  async fetch(
    @Request() { user },
    @Param('patientId') patientId: string,
  ): Promise<FullPatientDto> {
    const patient = await this.patientsService.getPatient(patientId, user);
    return plainToClass(FullPatientDto, patient);
  }

  @Permissions([
    { id: EPermission.ManagePatients, actions: [EPermissionAction.Create] },
  ])
  @UsePipes(CustomValidationPipe)
  @Post()
  async create(
    @Request() { user },
    @Body() dto: UpsertPatientDto,
  ): Promise<FullPatientDto> {
    const patient = await this.patientsService.upsertPatient(dto, user);
    return plainToClass(FullPatientDto, patient);
  }

  @Permissions([
    { id: EPermission.ManagePatients, actions: [EPermissionAction.Edit] },
  ])
  @UsePipes(CustomValidationPipe)
  @Put(`/:patientId`)
  async update(
    @Request() { user },
    @Param('patientId') patientId: string,
    @Body() dto: UpsertPatientDto,
  ): Promise<FullPatientDto> {
    const patient = await this.patientsService.upsertPatient(
      dto,
      user,
      patientId,
    );
    return plainToClass(FullPatientDto, patient);
  }

  @Permissions([
    { id: EPermission.ManagePatients, actions: [EPermissionAction.Delete] },
  ])
  @UsePipes(CustomValidationPipe)
  @Delete(`/:patientId`)
  async delete(
    @Request() { user },
    @Param('patientId') patientId: string,
  ): Promise<DeletedPatientDto> {
    const deletedPatient = await this.patientsService.deletePatient(
      patientId,
      user,
    );
    return plainToClass(DeletedPatientDto, deletedPatient);
  }

  @Permissions([
    { id: EPermission.ManagePatients, actions: [EPermissionAction.Edit] },
  ])
  @UsePipes(CustomValidationPipe)
  @Patch('/settings')
  async updateSetting(
    @Request() { user },
    @Param('patientId') patientId: string,
    @Body() updatePatientSettings: UpdatePatientSettingsDto,
  ): Promise<FullPatientDto> {
    const updatedPatient = await this.patientsService.upsertSettings(
      patientId,
      updatePatientSettings,
      user,
    );
    const fullpatientDto = plainToClass(FullPatientDto, updatedPatient);
    return fullpatientDto;
  }
}
