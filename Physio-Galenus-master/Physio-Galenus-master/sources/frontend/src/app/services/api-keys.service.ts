import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { makeRequest, objectToQueryString } from '@common/utils/network-utils';
import { FilterApiKeysDto } from '@common/dto/request/filter-api-keys.dto';
import { ApiKeysListDto } from '@common/dto/response/api-keys-list.dto';
import { UpdateApiKeyDto } from '@common/dto/request/update-api-key.dto';
import { ApiKeyDetailsDto } from '@common/dto/response/api-key-details.dto';
import { CreateApiKeyDto } from '@common/dto/request/create-api-key.dto';
import { apiKeysEndpoint } from '@config/endpoints.config';

@Injectable({ providedIn: 'root' })
export class ApiKeysService {
  constructor(private readonly http: HttpClient) {}

  list(filters?: FilterApiKeysDto): Observable<ApiKeysListDto> {
    const query = objectToQueryString(filters);
    return this.http.get<ApiKeysListDto>(`${apiKeysEndpoint.$full}?${query}`);
  }

  fetchById(id: string): Observable<ApiKeyDetailsDto> {
    return this.http.get<ApiKeyDetailsDto>(`${apiKeysEndpoint.$full}/${id}`);
  }

  fetchByKey(key: string): Observable<ApiKeyDetailsDto> {
    return this.http.get<ApiKeyDetailsDto>(
      `${apiKeysEndpoint.$full}/${apiKeysEndpoint.key.$part}/${key}`
    );
  }

  create(createApiKeyDto: CreateApiKeyDto): Observable<ApiKeyDetailsDto> {
    const requestBody = makeRequest(CreateApiKeyDto, createApiKeyDto);
    return this.http.post<ApiKeyDetailsDto>(apiKeysEndpoint.$full, requestBody);
  }

  update(
    id: string,
    updateApiKeyDto: UpdateApiKeyDto
  ): Observable<ApiKeyDetailsDto> {
    const requestBody = makeRequest(UpdateApiKeyDto, updateApiKeyDto);
    return this.http.patch<ApiKeyDetailsDto>(
      `${apiKeysEndpoint.$full}/${id}`,
      requestBody
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${apiKeysEndpoint.$full}/${id}`);
  }
}
