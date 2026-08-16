import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { PatientsService } from '@client-services/patients.service';
import {
  IPaginatedComponent,
  IPaginationData,
  IPaginationOptions,
} from '@common/interfaces/pagination.interface';
import { appConfig } from '@config/app.config';
import { logDebug } from 'src/app/utils/log';
import { PatientDetailsForListDto } from '@common-response-dto/patient-details-for-list.dto';
import { TablePatientsComponent } from '../elements/table-patients/table-patients.component';
import { FilterPatientsDto } from '@common-request-dto/filter-patients.dto';
import { paginationConfig } from '@config/pagination.config';
import { filterPatients } from './filter-patients';
import { IFilterData } from 'src/app/filter/filter-types';
import { FilterSearch } from 'src/app/filter/filter-search';

const relationsToInclude: string[] = [];

type TState = {
  heading: string;
  subheading: string;
  headingIcon: string;
  filterSearch: FilterSearch;
};

@Component({
  selector: 'app-my-patients',
  templateUrl: './my-patients.component.html',
  styleUrls: ['./my-patients.component.scss'],
})
export class MyPatientsComponent implements AfterViewInit, IPaginatedComponent {
  private _isLoading = false;

  state: TState = {
    heading: 'My Patients',
    subheading: 'List of visible patients for you',
    headingIcon: 'people',
    filterSearch: new FilterSearch(),
  };

  imports = {
    filterCriteria: filterPatients,
  };

  paginationData: IPaginationData = {
    pageSize: paginationConfig.defaultPageSize,
    page: 0,
  };
  paginationOptions: IPaginationOptions = {
    pageSizeOptions: paginationConfig.defaultPageSizeOptions,
  };

  patientList: PatientDetailsForListDto;

  @ViewChild('tablePatients', { static: true })
  tablePatients: TablePatientsComponent;

  constructor(private patientsService: PatientsService) {
    this.state.filterSearch.filterDto = new FilterPatientsDto();
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  set isLoading(loading: boolean) {
    this._isLoading = loading;
  }

  ngAfterViewInit(): void {
    this.onRefresh();
  }

  onRefresh(): void {
    const filterPatients: FilterPatientsDto = {
      data: {
        ...this.state.filterSearch.filterDto.data,
      },
      metadata: {
        ...this.paginationData,
        relations: relationsToInclude,
      },
    };

    this.isLoading = true;
    this.patientsService
      .list(filterPatients)
      .subscribe((patients) => {
        logDebug('Patients retrieved', patients);
        this.patientList = patients;
        this.paginationData = patients.metadata ?? this.paginationData;
        this.tablePatients.updatePatientList(this.patientList);
      })
      .add(async () => {
        await new Promise((f) => setTimeout(f, appConfig.minimumLoadTimeInMs));
        this.isLoading = false;
      });
  }

  onFilterChange(filters: IFilterData[]): void {
    this.onCreateFilters(filters);
    this.onRefresh();
  }

  onPageChange(): void {
    this.onRefresh();
  }

  private onCreateFilters(filters: IFilterData[]): void {
    this.state.filterSearch.filterDto = {
      data: {},
    } as FilterPatientsDto;
    this.state.filterSearch.populateFilterDto(filters);
  }
}
