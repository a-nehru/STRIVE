import { AfterViewInit, Component, ViewChild } from '@angular/core';
import {
  IPaginatedComponent,
  IPaginationData,
  IPaginationOptions,
} from '@common/interfaces/pagination.interface';
import { appConfig } from '@config/app.config';
import { logDebug } from 'src/app/utils/log';
import { FilterRoutinesDto } from '@common-request-dto/filter-routines.dto';
import { RoutineDetailsForListDto } from '@common-response-dto/routine-details-for-list.dto';
import { TableRoutinesComponent } from '../elements/table-routines/table-routines.component';
import { RoutinesService } from '@client-services/routines.service';
import { paginationConfig } from '@config/pagination.config';
import { FilterSearch } from 'src/app/filter/filter-search';
import { filterRoutines } from './filter-routines';
import { IFilterData } from 'src/app/filter/filter-types';

const relationsToInclude: string[] = [];

type TState = {
  heading: string;
  subheading: string;
  headingIcon: string;
  filterSearch: FilterSearch;
};

@Component({
  selector: 'app-my-routines',
  templateUrl: './my-routines.component.html',
  styleUrls: ['./my-routines.component.scss'],
})
export class MyRoutinesComponent implements AfterViewInit, IPaginatedComponent {
  private _isLoading = false;

  state: TState = {
    heading: 'My Routines',
    subheading: 'List of visible routines for you',
    headingIcon: 'fitness_center',
    filterSearch: new FilterSearch(),
  };

  imports = {
    filterCriteria: filterRoutines,
  };

  paginationData: IPaginationData = {
    pageSize: paginationConfig.defaultPageSize,
    page: 0,
  };
  paginationOptions: IPaginationOptions = {
    pageSizeOptions: paginationConfig.defaultPageSizeOptions,
  };

  routineList: RoutineDetailsForListDto;

  @ViewChild('tableRoutines', { static: true })
  tableRoutines: TableRoutinesComponent;

  constructor(private routinesService: RoutinesService) {
    this.state.filterSearch.filterDto = new FilterRoutinesDto();
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
    const filterRoutines: FilterRoutinesDto = {
      data: {
        ...this.state.filterSearch.filterDto.data,
      },
      metadata: {
        ...this.paginationData,
        relations: relationsToInclude,
      },
    };

    this.isLoading = true;
    this.routinesService
      .list(filterRoutines)
      .subscribe((routines) => {
        logDebug('Routines retrieved', routines);
        this.routineList = routines;
        this.paginationData = routines.metadata ?? this.paginationData;
        this.tableRoutines.updateRoutineList(this.routineList);
      })
      .add(async () => {
        await new Promise((f) => setTimeout(f, appConfig.minimumLoadTimeInMs));
        this.isLoading = false;
      });
  }

  updateRoutineList(filters: IFilterData[]): void {
    this.onCreateFilters(filters);
    this.onRefresh();
  }

  onPageChange(): void {
    this.onRefresh();
  }

  private onCreateFilters(filters: IFilterData[]): void {
    this.state.filterSearch.filterDto = {
      data: {
        daysOfWeek: [],
      },
    } as FilterRoutinesDto;
    this.state.filterSearch.populateFilterDto(filters);
  }
}
