import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { makeRequest, objectToQueryString } from '@common/utils/network-utils';
import { RoleWithPermissionsByCategoriesDto } from '@common-response-dto/role-with-permissions-by-categories.dto';
import { CreateRoleDto } from '@common-request-dto/create-role.dto';
import { FilterRolesDto } from '@common-request-dto/filter-roles.dto';
import { UpdateRolePermissionsDto } from '@common-request-dto/update-role-permissions.dto';
import { aclEndpoint } from '@config/endpoints.config';

@Injectable({
  providedIn: 'root',
})
export class RolesService {
  constructor(private readonly http: HttpClient) {}

  findAll(
    filters?: FilterRolesDto
  ): Observable<RoleWithPermissionsByCategoriesDto[]> {
    const query = objectToQueryString(
      makeRequest(FilterRolesDto, filters as any)
    );
    return this.http.get<RoleWithPermissionsByCategoriesDto[]>(
      `${aclEndpoint.roles.$full}?${query}`
    );
  }

  findById(id: string): Observable<RoleWithPermissionsByCategoriesDto> {
    return this.http.get<RoleWithPermissionsByCategoriesDto>(
      `${aclEndpoint.roles.$full}/${id}`
    );
  }

  create(urpdto: CreateRoleDto): Observable<CreateRoleDto> {
    return this.http.put<CreateRoleDto>(
      `${aclEndpoint.roles.$full}/${urpdto.id}`,
      urpdto
    );
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${aclEndpoint.roles.$full}/${id}`);
  }

  updateRolePermissions(
    urpdto: UpdateRolePermissionsDto,
    roleId: string
  ): Observable<RoleWithPermissionsByCategoriesDto> {
    return this.http.patch<RoleWithPermissionsByCategoriesDto>(
      `${aclEndpoint.roles.$full}/${roleId}/${aclEndpoint.roles.permissions.$part}`,
      urpdto
    );
  }
}
