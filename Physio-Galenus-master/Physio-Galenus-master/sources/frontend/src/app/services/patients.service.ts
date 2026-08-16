import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FilterPatientsDto } from '@common-request-dto/filter-patients.dto';
import { FullPatientDto } from '@common-response-dto/full-patient.dto';
import { PatientDetailsForListDto } from '@common-response-dto/patient-details-for-list.dto';
import { UpsertPatientDto } from '@common-request-dto/upsert-patient.dto';
import { DeletedPatientDto } from '@common-response-dto/deleted-patient.dto';
import { makeRequest, objectToQueryString } from '@common-utils/network-utils';
import { patientsEndpoint } from '@config/endpoints.config';
@Injectable({ providedIn: 'root' })
export class PatientsService {
  constructor(private readonly http: HttpClient) {}

  list(filters?: FilterPatientsDto): Observable<PatientDetailsForListDto> {
    const query = objectToQueryString(
      makeRequest(FilterPatientsDto, filters as any)
    );
    return this.http.get<PatientDetailsForListDto>(
      `${patientsEndpoint.$full}?${query}`
    );
  }

  fetch(patientId: string): Observable<FullPatientDto> {
    return this.http.get<FullPatientDto>(
      `${patientsEndpoint.$full}/${patientId}`
    );
  }

  insert(
    updatePatientDetailsDto: UpsertPatientDto
  ): Observable<FullPatientDto> {
    return this.http.post<FullPatientDto>(
      `${patientsEndpoint.$full}`,
      updatePatientDetailsDto
    );
  }

  update(
    patientId: string,
    updatePatientDetailsDto: UpsertPatientDto
  ): Observable<FullPatientDto> {
    return this.http.put<FullPatientDto>(
      `${patientsEndpoint.$full}/${patientId}`,
      updatePatientDetailsDto
    );
  }

  delete(patientId: string): Observable<DeletedPatientDto> {
    return this.http.delete<DeletedPatientDto>(
      `${patientsEndpoint.$full}/${patientId}`
    );
  }
}
