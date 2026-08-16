import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { SummarizedStatisticsDto } from '@common-response-dto/summarized-statistics.dto';
import { GetSummarizedStatisticsDto } from '@common-request-dto/get-summarized-statistics.dto';
import { makeRequest, objectToQueryString } from '@common/utils/network-utils';
import { statisticsEndpoint } from '@config/endpoints.config';

@Injectable({ providedIn: 'root' })
export class StatisticsService {
  constructor(private readonly http: HttpClient) {}

  fetchSummarizedStatistics(
    dto: GetSummarizedStatisticsDto
  ): Observable<SummarizedStatisticsDto> {
    const query = objectToQueryString(
      makeRequest(GetSummarizedStatisticsDto, dto as any)
    );
    return this.http.get<SummarizedStatisticsDto>(
      `${statisticsEndpoint.$full}?${query}`
    );
  }
}
