import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UsePipes,
  Request,
} from '@nestjs/common';
import { ExercisesService } from './exercises.service';
import { CustomValidationPipe } from 'src/pipes/custom-validation.pipe';
import { plainToClass } from 'class-transformer';
import { exercisesEndpoint } from '@config/endpoints.config';
import { CookieAuthenticationGuard } from 'src/guards/cookie-authentication.guard';
import { FullExerciseDto } from '@common-response-dto/full-exercise.dto';
import { FilterExercisesDto } from '@common-request-dto/filter-exercises.dto';
import { ExerciseDetailsForListDto } from '@common-response-dto/exercise-details-for-list.dto';
import { ExercisesSearchService } from './exercises-search.service';
import { makeResponse } from '@common-utils/network-utils';
import { PermissionsGuard } from 'src/guards/permissions.guard';
import { EPermission, EPermissionAction } from 'src/common/permissions';
import { Permissions } from 'src/guards/permissions.decorator';
import { AutonomousExercisesDto } from '@common-response-dto/autonomous-exercises.dto';

@UseGuards(CookieAuthenticationGuard, PermissionsGuard)
@Controller(exercisesEndpoint.$full)
export class ExercisesController {
  constructor(
    private readonly exercisesSearchService: ExercisesSearchService,
    private readonly exercisesService: ExercisesService,
  ) {}

  @Permissions([
    { id: EPermission.ManageExercises, actions: [EPermissionAction.List] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get()
  async list(
    @Request() { user },
    @Query() query: FilterExercisesDto,
  ): Promise<ExerciseDetailsForListDto> {
    const result = await this.exercisesSearchService.list(user, query);
    const exerciseDetailsForListDto = makeResponse(ExerciseDetailsForListDto, {
      data: result.entities,
      metadata: result.pagination,
    });
    return exerciseDetailsForListDto;
  }

  @Permissions([
    { id: EPermission.ManageExercises, actions: [EPermissionAction.Read] },
  ])
  @UsePipes(CustomValidationPipe)
  @Get(`/:exerciseId`)
  async fetch(
    @Param('exerciseId') exerciseId: string,
  ): Promise<FullExerciseDto> {
    const exercise = await this.exercisesService.getExercise(exerciseId);
    return plainToClass(FullExerciseDto, exercise);
  }

  // TO DO: Do patients have permissions?
  @Get(exercisesEndpoint.patient.autonomous.$full)
  @UsePipes(CustomValidationPipe)
  async getPatientAutonomousExercises(
    @Request() { user },
  ): Promise<AutonomousExercisesDto> {
    const exercises = await this.exercisesService.getAutonomousExercises(user);
    return plainToClass(AutonomousExercisesDto, { exercises });
  }
}
