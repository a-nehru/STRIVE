import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FullExerciseDto } from '@common-response-dto/full-exercise.dto';
import { makeRequest, objectToQueryString } from '@common/utils/network-utils';
import { FilterExercisesDto } from '@common-request-dto/filter-exercises.dto';
import { ExerciseDetailsForListDto } from '@common-response-dto/exercise-details-for-list.dto';
import { exercisesEndpoint } from '@config/endpoints.config';

@Injectable({ providedIn: 'root' })
export class ExercisesService {
  constructor(private readonly http: HttpClient) {}

  list(filters?: FilterExercisesDto): Observable<ExerciseDetailsForListDto> {
    const query = objectToQueryString(
      makeRequest(FilterExercisesDto, filters as any)
    );
    return this.http.get<ExerciseDetailsForListDto>(
      `${exercisesEndpoint.$full}?${query}`
    );
  }

  fetch(exerciseId: string): Observable<FullExerciseDto> {
    return this.http.get<FullExerciseDto>(
      `${exercisesEndpoint.$full}/${exerciseId}`
    );
  }
}
