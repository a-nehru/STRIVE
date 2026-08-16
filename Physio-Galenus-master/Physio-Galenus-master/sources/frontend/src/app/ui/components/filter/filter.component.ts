import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { upsert } from '@common/utils/array-utils';
import { isoDateToTime, isoFromDate } from '@common/utils/date-utils';
import { cloneDeep } from 'lodash';
import {
  EFilterType,
  IFilterCriteria,
  IFilterData,
} from 'src/app/filter/filter-types';

type TSelectOpt = {
  id: string;
  content: string;
};

type TFilterState = {
  data: IFilterData;
  list: IFilterData[];
  inputs: IFilterData[];
};

@Component({
  selector: 'app-filter',
  templateUrl: './filter.component.html',
  styleUrls: ['./filter.component.scss'],
})
export class FilterComponent implements OnInit {
  private mapFilterFields: Map<EFilterType, (filter: IFilterData) => void>;
  private mapParseValues: Map<EFilterType, () => void>;
  private mapResources: Map<string, TSelectOpt[]>;

  @Input() urlChange = true;
  @Input() label: string;
  @Input() filterCriteria: IFilterCriteria;
  @Input() forOrder: boolean;
  @Output() filterChange = new EventEmitter<any>();

  isTextFilterEditing: boolean;
  isDateFilterEditing: boolean;
  isTimeFilterEditing: boolean;
  isBoolFilterEditing: boolean;
  isSelectFilterEditing: boolean;
  isNumberFilterEditing: boolean;

  selectOptions: TSelectOpt[] = [];

  state: TFilterState = {
    data: {} as IFilterData,
    list: [] as IFilterData[],
    inputs: [] as IFilterData[],
  };

  constructor(private router: Router, private route: ActivatedRoute) {
    this.mapFilterFields = new Map<EFilterType, (filter?: IFilterData) => void>(
      [
        [EFilterType.TextType, () => this.onAddTextInput()],
        [EFilterType.BooleanType, () => this.onAddBooleanInput()],
        [EFilterType.DateType, () => this.onAddDateInput()],
        [EFilterType.TimeType, () => this.onAddTimeInput()],
        [
          EFilterType.SelectType,
          (filter?: IFilterData) => this.onAddSelectInput(filter),
        ],
        [EFilterType.NumberType, () => this.onAddNumberInput()],
      ]
    );

    this.mapParseValues = new Map<EFilterType, () => void>([
      [EFilterType.TextType, () => this.parseSimpleInput()],
      [EFilterType.BooleanType, () => this.parseSimpleInput()],
      [EFilterType.DateType, () => this.parseDateInput()],
      [EFilterType.TimeType, () => this.parseDateTimeInput()],
      [EFilterType.SelectType, () => this.parseSimpleInput()],
      [EFilterType.NumberType, () => this.parseSimpleInput()],
    ]);

    this.mapResources = new Map<string, TSelectOpt[]>([]);
  }

  ngOnInit(): void {
    const { criteria } = this.filterCriteria;
    for (const section of criteria) {
      for (const filter of section.filters) {
        this.state.inputs.push({
          ...filter,
        });
        const { resource } = filter;
        if (resource?.callback) {
          this.mapResources.set(filter.filter, resource.callback({}));
        }
      }
    }

    if (this.urlChange) {
      this.updateFiltersURL();
    }
  }

  onRefresh(): void {
    this.filterChange.emit(this.state.list);
  }

  async onAdd(): Promise<void> {
    const { type } = this.state.data;
    if (!this.mapParseValues.has(type)) {
      return;
    }
    this.mapParseValues.get(type)!();

    const filterData = { ...this.state.data };
    upsert(
      this.state.list,
      filterData,
      (item) =>
        item.filter === filterData.filter && item.content === filterData.content
    );

    if (this.urlChange) {
      await this.addFilterToURL(filterData);
    }

    this.reset();
    this.disableAll();
  }

  onRun(): void {
    this.onAdd();
    this.onRefresh();
  }

  async onCancel(): Promise<void> {
    if (this.urlChange) {
      await this.deleteFilterFromURL({ ...this.state.data });
    }

    this.reset();
    this.disableAll();
    this.onRefresh();
  }

  async onEdit(filterData: IFilterData): Promise<void> {
    for (const [i, f] of this.state.list.entries()) {
      const { filter } = filterData;
      if (filter === f.filter) {
        this.state.list.splice(i, 1);
        break;
      }
    }
    this.onStart(filterData);
  }

  onStart(filter: IFilterData): void {
    if (!this.mapFilterFields.has(filter.type)) {
      return;
    }
    this.mapFilterFields.get(filter.type)!(filter);

    this.state.data = { ...this.state.data, ...filter };
  }

  async onDelete(filter: string, content: string): Promise<void> {
    const index = this.state.list.findIndex(
      (item) => item.filter === filter && item.content === content
    );
    const deleted = this.state.list.splice(index, 1);

    if (this.urlChange) {
      await this.deleteFilterFromURL(deleted.pop()!);
    }

    this.reset();
    this.onRefresh();
  }

  async onClear(): Promise<void> {
    if (this.urlChange) {
      for (const filter of this.state.list) {
        await this.deleteFilterFromURL(filter);
      }
    }

    this.resetAll();
    this.onRefresh();
  }

  canBeUsed(filter: string, isMultiple?: boolean): boolean {
    if (isMultiple) {
      return true;
    }
    const isUsed = this.state.list.find((item) => item.filter === filter);
    return !isUsed ? true : false;
  }

  nameToDisplay(filterData: IFilterData): string {
    return filterData.filter.includes('orderBy')
      ? `Order By ${filterData.name} : ${
          filterData.content === 'false' ? 'Desc' : 'Asc'
        }`
      : `${filterData.name} : ${filterData.content}`;
  }

  private reset(): void {
    this.state.data = {} as IFilterData;
  }

  private resetAll(): void {
    this.state.data = {} as IFilterData;
    this.state.list = [] as IFilterData[];
  }

  private disableAll(): void {
    this.isTextFilterEditing = false;
    this.isDateFilterEditing = false;
    this.isBoolFilterEditing = false;
    this.isTimeFilterEditing = false;
    this.isNumberFilterEditing = false;
    this.isSelectFilterEditing = false;
  }

  private onAddTextInput(): void {
    this.isTextFilterEditing = true;
  }

  private onAddBooleanInput(): void {
    this.isBoolFilterEditing = true;
  }

  private onAddDateInput(): void {
    this.isDateFilterEditing = true;
  }

  private onAddTimeInput(): void {
    this.isTimeFilterEditing = true;
  }

  private onAddNumberInput(): void {
    this.isNumberFilterEditing = true;
  }

  private onAddSelectInput(filterData?: IFilterData): void {
    this.isSelectFilterEditing = true;

    if (!filterData?.filter) {
      return;
    }

    const { filter } = filterData;
    if (!this.mapResources.has(filter)) {
      return;
    }
    this.selectOptions = this.mapResources.get(filter)!;
  }

  private parseSimpleInput(): void {
    this.state.data = {
      ...this.state.data,
      content: this.state.data.value,
      parsedValue: this.state.data.value,
    };
  }

  private parseDateInput(): void {
    const { value } = this.state.data;
    if (value) {
      const isoDate = new Date(value);
      const isoStringDate = isoFromDate(isoDate);
      if (isoStringDate) {
        this.state.data = {
          ...this.state.data,
          value: isoDate,
          content: isoStringDate,
          parsedValue: isoStringDate,
        };
      }
    }
  }

  private parseDateTimeInput(): void {
    const { value } = this.state.data;
    if (value) {
      const isoDateTime = new Date(value);
      const isoStringDateTime = isoDateToTime(isoDateTime);
      if (isoStringDateTime) {
        this.state.data = {
          ...this.state.data,
          value: isoDateTime,
          content: isoStringDateTime,
          parsedValue: isoStringDateTime,
        };
      }
    }
  }

  //////////////////////////////////////////////////////////////
  // Specific functions to handle URL changes are found below //
  //////////////////////////////////////////////////////////////

  private async addFilterToURL(filterData: IFilterData): Promise<void> {
    const { filter, options, value } = filterData;

    // In order to update successfully queryParams the original object
    // cannot be modified. Therefore, a clone is used to modify the parameters
    const queryParams = cloneDeep(this.route.snapshot.queryParams);
    if (queryParams[filter] && queryParams[filter] === value) {
      return;
    }

    queryParams[filter] = options?.isMultiple
      ? Array.isArray(queryParams[filter])
        ? queryParams[filter].includes(value)
          ? [...queryParams[filter]]
          : [...queryParams[filter], value]
        : [value]
      : value;

    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        ...queryParams,
      },
    });
  }

  private async deleteFilterFromURL(filterData: IFilterData): Promise<void> {
    const { filter, options, content } = filterData;

    // In order to update successfully queryParams the original object
    // cannot be modified. Therefore, a clone is used to modify the parameters
    const queryParams = cloneDeep(this.route.snapshot.queryParams);
    if (options?.isMultiple) {
      const index = queryParams[filter].findIndex(
        (item: any) => item === content
      );
      if (index > -1) {
        queryParams[filter].splice(index, 1);
      }
    } else {
      delete queryParams[filter];
    }

    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        ...queryParams,
      },
    });
  }

  private async updateFiltersURL(): Promise<void> {
    const { queryParams } = this.route.snapshot;
    for (const [key, value] of Object.entries(queryParams)) {
      let filter = this.state.inputs.find((item) => item.filter === key);
      if (!filter || !this.canBeUsed(filter.filter)) {
        continue;
      }

      const size = filter.options?.isMultiple ? value.length : 0;

      let i = 0;
      do {
        const elm = size > 0 ? value[i] : value;

        filter = { ...filter, value: elm };
        this.onStart(filter);
        await this.onAdd();

        i = i + 1;
      } while (i < size);
    }
    this.onRefresh();
  }
}
