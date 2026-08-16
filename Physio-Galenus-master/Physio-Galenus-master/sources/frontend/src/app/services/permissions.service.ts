import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CategoryWithPermissionsDto } from '@common/dto/response/category-with-permissions.dto';
import { Observable } from 'rxjs';
import { aclEndpoint } from '@config/endpoints.config';

@Injectable({
  providedIn: 'root',
})
export class PermissionsService {
  constructor(private readonly http: HttpClient) {}

  findAll(): Observable<CategoryWithPermissionsDto[]> {
    return this.http.get<CategoryWithPermissionsDto[]>(
      aclEndpoint.permissions.$full
    );
  }
}
