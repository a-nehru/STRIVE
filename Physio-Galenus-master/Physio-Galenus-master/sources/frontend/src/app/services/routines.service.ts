import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FilterRoutinesDto } from '@common-request-dto/filter-routines.dto';
import { makeRequest, objectToQueryString } from '@common/utils/network-utils';
import { UpsertRoutineDto } from '@common-request-dto/upsert-routine.dto';
import { FullRoutineDto } from '@common-response-dto/full-routine.dto';
import { RoutineDetailsForListDto } from '@common-response-dto/routine-details-for-list.dto';
import { DeletedRoutineDto } from '@common-response-dto/deleted-routine.dto';
import { RoutineDifficultyAdjustmentDto } from '@common-response-dto/routine-difficulty-adjustment.dto';
import { routinesEndpoint } from '@config/endpoints.config';

@Injectable({ providedIn: 'root' })
export class RoutinesService {
  constructor(private readonly http: HttpClient) {}

  list(filters?: FilterRoutinesDto): Observable<RoutineDetailsForListDto> {
    const query = objectToQueryString(
      makeRequest(FilterRoutinesDto, filters as any)
    );
    return this.http.get<RoutineDetailsForListDto>(
      `${routinesEndpoint.$full}?${query}`
    );
  }

  fetch(routineId: string): Observable<FullRoutineDto> {
    return this.http.get<FullRoutineDto>(
      `${routinesEndpoint.$full}/${routineId}`
    );
  }

  insert(
    insertRoutineDetailsDto: UpsertRoutineDto
  ): Observable<FullRoutineDto> {
    return this.http.post<FullRoutineDto>(
      `${routinesEndpoint.$full}`,
      insertRoutineDetailsDto
    );
  }

  update(
    routineId: string,
    updateRoutineDetailsDto: UpsertRoutineDto
  ): Observable<FullRoutineDto> {
    return this.http.put<FullRoutineDto>(
      `${routinesEndpoint.$full}/${routineId}`,
      updateRoutineDetailsDto
    );
  }

  delete(routineId: string): Observable<DeletedRoutineDto> {
    return this.http.delete<DeletedRoutineDto>(
      `${routinesEndpoint.$full}/${routineId}`
    );
  }

  adjustRoutineDifficulty(routineId: string): Observable<void> {
    return this.http.post<void>(
      `${routinesEndpoint.routineDifficultyAdjustment.$full}/${routineId}`,
      null
    );
  }

  getRoutineDifficultyAdjustment(
    routineId: string
  ): Observable<RoutineDifficultyAdjustmentDto> {
    return this.http.get<RoutineDifficultyAdjustmentDto>(
      `${routinesEndpoint.routineDifficultyAdjustment.$full}/${routineId}`
    );
  }

  acceptRoutineDifficultyAdjustment(routineId: string): Observable<void> {
    return this.http.post<void>(
      `${routinesEndpoint.acceptAdjustment.$full}/${routineId}`,
      null
    );
  }

  discardRoutineDifficultyAdjustment(routineId: string): Observable<void> {
    return this.http.post<void>(
      `${routinesEndpoint.discardAdjustment.$full}/${routineId}`,
      null
    );
  }
}
