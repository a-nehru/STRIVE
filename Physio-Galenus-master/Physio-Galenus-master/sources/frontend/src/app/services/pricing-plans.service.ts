import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { pricingPlanEndpoint } from '@config/endpoints.config';
import { Observable } from 'rxjs';
import { FilterPricingPlansListDto } from '@common-request-dto/filter-pricing-plans.dto';
import { PricingPlansListDto } from '@common-response-dto/pricing-plans-list.dto';

@Injectable({
  providedIn: 'root',
})
export class PricingPlansService {
  constructor(private readonly http: HttpClient) {}

  list(query?: FilterPricingPlansListDto): Observable<PricingPlansListDto> {
    return this.http.get<PricingPlansListDto>(pricingPlanEndpoint.list.$full);
  }
}
