import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateUserDto } from '@common-request-dto/create-user.dto';
import { UpdateUserDto } from '@common-request-dto/update-user.dto';
import { UpdateUserRolesDto } from '@common-request-dto/update-user-roles.dto';
import { FullUserDto } from '@common-response-dto/full-user.dto';
import { DeletedUserDto } from '@common-response-dto/deleted-user.dto';
import { FilterUsersDto } from '@common-request-dto/filter-users.dto';
import { makeRequest, objectToQueryString } from '@common/utils/network-utils';
import {
  UserSimpleDetailsForListDto,
  SimpleUserDtoData,
} from '@common-response-dto/user-simple-details-for-list.dto';
import { UpdateUserPermissionsDto } from '@common-request-dto/update-user-permissions.dto';
import { usersEndpoint } from '@config/endpoints.config';

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private readonly http: HttpClient) {}

  findAll(filters?: FilterUsersDto): Observable<FullUserDto[]> {
    const query = objectToQueryString(
      makeRequest(FilterUsersDto, filters as any)
    );
    return this.http.get<FullUserDto[]>(`${usersEndpoint.$full}?${query}`);
  }

  findSimple(filters?: FilterUsersDto): Observable<SimpleUserDtoData[]> {
    const query = objectToQueryString(
      makeRequest(FilterUsersDto, filters as any)
    );
    return this.http.get<SimpleUserDtoData[]>(
      `${usersEndpoint.simple.$full}?${query}`
    );
  }

  listSimple(
    filters?: FilterUsersDto
  ): Observable<UserSimpleDetailsForListDto> {
    const query = objectToQueryString(
      makeRequest(FilterUsersDto, filters as any)
    );
    return this.http.get<UserSimpleDetailsForListDto>(
      `${usersEndpoint.listSimple.$full}?${query}`
    );
  }

  fetch(userId: string): Observable<FullUserDto> {
    return this.http.get<FullUserDto>(`${usersEndpoint.$full}/${userId}`);
  }

  create(createUserDto: CreateUserDto): Observable<FullUserDto> {
    return this.http.post<FullUserDto>(`${usersEndpoint.$full}`, createUserDto);
  }

  update(
    userId: string,
    updateUserDto: UpdateUserDto
  ): Observable<FullUserDto> {
    return this.http.put<FullUserDto>(
      `${usersEndpoint.$full}/${userId}`,
      updateUserDto
    );
  }

  delete(userId: string): Observable<DeletedUserDto> {
    return this.http.delete<DeletedUserDto>(`${usersEndpoint.$full}/${userId}`);
  }

  updateUserRoles(
    urpdto: UpdateUserRolesDto,
    userId: string
  ): Observable<FullUserDto> {
    return this.http.patch<FullUserDto>(`users/${userId}/roles`, urpdto);
  }

  updateUserPermissions(
    urpdto: UpdateUserPermissionsDto,
    userId: string
  ): Observable<FullUserDto> {
    return this.http.patch<FullUserDto>(`users/${userId}/permissions`, urpdto);
  }
}
