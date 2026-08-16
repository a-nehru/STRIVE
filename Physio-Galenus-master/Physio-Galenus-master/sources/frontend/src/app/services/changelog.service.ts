import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { objectToQueryString } from '@common/utils/network-utils';
import { Observable } from 'rxjs';
import { FilterChangelogChangesListDto } from '@common-request-dto/filter-changelog-changes-list.dto';
import { ChangelogChangesListDto } from '@common-response-dto/changelog-changes-list.dto';
import { DownloadFileResponseDto } from '@common-response-dto/download-file.dto';
import { changelogEndpoint } from '@config/endpoints.config';

@Injectable({ providedIn: 'root' })
export class ChangelogService {
  constructor(private readonly http: HttpClient) {}

  list(
    filters?: FilterChangelogChangesListDto
  ): Observable<ChangelogChangesListDto> {
    const query = objectToQueryString(filters);
    return this.http.get<ChangelogChangesListDto>(
      `${changelogEndpoint.$full}?${query}`
    );
  }

  download(
    filters?: FilterChangelogChangesListDto
  ): Observable<DownloadFileResponseDto> {
    const query = objectToQueryString(filters);
    return this.http.get<DownloadFileResponseDto>(
      `${changelogEndpoint.download.$full}?${query}`
    );
  }
}
