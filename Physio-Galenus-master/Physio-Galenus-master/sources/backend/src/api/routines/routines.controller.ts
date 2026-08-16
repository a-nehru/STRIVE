import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Put,
  Query,
  UsePipes,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { plainToClass } from 'class-transformer';
import { routinesEndpoint } from '@config/endpoints.config';
import { makeResponse } from '@common-utils/network-utils';
import { UpsertRoutineDto } from '@common-request-dto/upsert-routine.dto';
import { FullRoutineDto } from '@common-response-dto/full-routine.dto';
import { FilterRoutinesDto } from '@common-request-dto/filter-routines.dto';
import { RoutinesSearchService } from './routines-search.service';
import { RoutineDetailsForListDto } from '@common-response-dto/routine-details-for-list.dto';
import { DeletedRoutineDto } from '@common-response-dto/deleted-routine.dto';
import { EPermission, EPermissionAction } from 'src/common/permissions';
import { Permissions } from 'src/guards/permissions.decorator';
import { RoutineProgressDto } from '@common-response-dto/routine-progress';
import { UpsertRoutineProgressDto } from '@common-request-dto/upsert-routine-progress';
import { RoutinesAdjustDifficultyService } from './adjust-difficulty/routines-adjust-difficulty.service';
import { RoutineDifficultyAdjustmentDto } from '@common-response-dto/routine-difficulty-adjustment.dto';
import { CookieAuthenticationGuard } from 'src/guards/cookie-authentication.guard';
import { PermissionsGuard } from 'src/guards/permissions.guard';
import { FullPatientDto } from '@common-response-dto/full-patient.dto';

@UseGuards(CookieAuthenticationGuard, PermissionsGuard)
@Controller(routinesEndpoint.$full)
export class RoutinesController {
  private readonly logger = new Logger(RoutinesController.name);

  constructor(
    private readonly routinesSearchService: RoutinesSearchService,
    private readonly routinesService: RoutinesService,
    private readonly routinesAdjustDifficultyService: RoutinesAdjustDifficultyService,
  ) {}

  @Permissions([
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.List] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get()
  async list(
    @Request() { user },
    @Query() query: FilterRoutinesDto,
  ): Promise<any> {
    const result = await this.routinesSearchService.list(query, user);
    const routineDetailsForListDto = makeResponse(RoutineDetailsForListDto, {
      data: result.entities,
      metadata: result.pagination,
    });
    return routineDetailsForListDto;
  }

  @Permissions([
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Read] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get(`/:routineId`)
  async fetch(
    @Request() { user },
    @Param('routineId') routineId: string,
  ): Promise<FullRoutineDto> {
    const routine = await this.routinesService.getRoutine(routineId, user);
    return plainToClass(FullRoutineDto, routine);
  }

  @Permissions([
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Create] },
  ])
  @UsePipes(CustomValidationPipe)
  @Post()
  async insert(
    @Request() { user },
    @Body() dto: UpsertRoutineDto,
  ): Promise<FullRoutineDto> {
    const routine = await this.routinesService.upsertRoutine(dto, user);
    return plainToClass(FullRoutineDto, routine);
  }

  @Permissions([
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Edit] },
  ])
  @UsePipes(CustomValidationPipe)
  @Put(`/:routineId`)
  async update(
    @Request() { user },
    @Param('routineId') routineId: string,
    @Body() dto: UpsertRoutineDto,
  ): Promise<FullRoutineDto> {
    const routine = await this.routinesService.upsertRoutine(
      dto,
      user,
      routineId,
    );
    return plainToClass(FullRoutineDto, routine);
  }

  @Permissions([
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Delete] },
  ])
  @UsePipes(CustomValidationPipe)
  @Delete(`/:routineId`)
  async delete(
    @Request() { user },
    @Param('routineId') routineId: string,
  ): Promise<DeletedRoutineDto> {
    const deletedRoutine = await this.routinesService.deleteRoutine(
      routineId,
      user,
    );
    return plainToClass(DeletedRoutineDto, deletedRoutine);
  }

  // TO DO: Do patients have permissions?
  @Get(routinesEndpoint.patient.routine.$full)
  @UsePipes(CustomValidationPipe)
  async getPatientRoutine(@Request() { user }): Promise<FullRoutineDto> {
    const routine = await this.routinesService.getPatientRoutine(user);
    return plainToClass(FullRoutineDto, routine);
  }

  @Post(routinesEndpoint.patient.routineProgress.$full)
  @UsePipes(CustomValidationPipe)
  async upsertPatientRoutineProgress(
    @Request() { user },
    @Body() dto: UpsertRoutineProgressDto,
  ): Promise<RoutineProgressDto> {
    const routineProgress = await this.routinesService.upsertRoutineProgress(
      { id: user.id } as FullPatientDto,
      dto,
    );
    return plainToClass(RoutineProgressDto, routineProgress);
  }

  @Get(routinesEndpoint.patient.routineProgress.$full)
  @UsePipes(CustomValidationPipe)
  async getPatientRoutineProgress(
    @Request() { user },
  ): Promise<RoutineProgressDto> {
    const routineProgress = await this.routinesService.getRoutineProgress(user);
    return plainToClass(RoutineProgressDto, routineProgress);
  }

  @Permissions([
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Edit] },
  ])
  @UsePipes(CustomValidationPipe)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post(`${routinesEndpoint.routineDifficultyAdjustment.$part}/:routineId`)
  async adjustRoutineDifficulty(
    @Request() { user },
    @Param('routineId') routineId: string,
  ): Promise<void> {
    this.routinesAdjustDifficultyService
      .adjustRoutineDifficulty(routineId, user)
      .catch((error) => {
        this.logger.error(
          `Difficulty adjustment failed for routine ${routineId}: ${error.message}`,
          error.stack,
        );
      });
  }

  @Permissions([
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Read] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get(`${routinesEndpoint.routineDifficultyAdjustment.$part}/:routineId`)
  async getRoutineDifficultyAdjustment(
    @Request() { user },
    @Param('routineId') routineId: string,
  ): Promise<RoutineDifficultyAdjustmentDto> {
    const routineDifficultyAdjustment =
      await this.routinesAdjustDifficultyService.getRoutineDifficultyAdjustment(
        routineId,
        user,
      );

    return plainToClass(
      RoutineDifficultyAdjustmentDto,
      routineDifficultyAdjustment,
    );
  }

  @Permissions([
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Edit] },
  ])
  @UsePipes(CustomValidationPipe)
  @Post(`${routinesEndpoint.acceptAdjustment.$part}/:routineId`)
  async acceptDifficultyAdjustment(
    @Request() { user },
    @Param('routineId') routineId: string,
  ): Promise<void> {
    await this.routinesAdjustDifficultyService.acceptDifficultyAdjustment(
      routineId,
      user,
    );
  }

  @Permissions([
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Edit] },
  ])
  @UsePipes(CustomValidationPipe)
  @Post(`${routinesEndpoint.discardAdjustment.$part}/:routineId`)
  async discardDifficultyAdjustment(
    @Request() { user },
    @Param('routineId') routineId: string,
  ): Promise<void> {
    await this.routinesAdjustDifficultyService.discardDifficultyAdjustment(
      routineId,
      user,
    );
  }
}
