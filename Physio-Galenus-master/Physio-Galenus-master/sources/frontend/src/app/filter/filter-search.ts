import { PaginatedRequestDto } from '@common-request-dto/paginated-request.dto';
import { IFilterData, IFilterSearch } from './filter-types';

export class FilterSearch implements IFilterSearch {
  private _filterDto: PaginatedRequestDto;

  constructor() {}

  get filterDto(): PaginatedRequestDto {
    return this._filterDto;
  }

  set filterDto(newFilterDto: PaginatedRequestDto) {
    this._filterDto = newFilterDto;
  }

  populateFilterDto(filters: IFilterData[]): void {
    for (const f of filters.values()) {
      if (Array.isArray(this.filterDto.data[f.filter])) {
        this.filterDto.data[f.filter].push(f.parsedValue);
      } else {
        this.filterDto.data[f.filter] = f.parsedValue;
      }
    }
    this.cleanFilter();
  }

  private cleanFilter(): void {
    for (const f of Object.keys(this.filterDto.data)) {
      if (
        Array.isArray(this.filterDto.data[f]) &&
        this.filterDto.data[f].length === 0
      ) {
        delete this.filterDto.data[f];
      }
    }
  }
}
