import { PaginatedRequestDto } from '@common/dto/request/paginated-request.dto';

/**
 * Interface to implement within a class that contains the logic to create a filter object.
 */
export interface IFilterSearch {
  filterDto: PaginatedRequestDto;
  populateFilterDto: (filters: IFilterData[]) => void;
}

/**
 * Interface used to describe filter criteria.
 */
export interface IFilterCriteria {
  readonly criteria: IFilterSection[];
}

/**
 * Interface used to store the filters and their group.
 */
export interface IFilterSection {
  readonly group?: string;
  readonly filters: IFilter[];
}

/**
 * Interface used to specify the filter data.
 */
export interface IFilter {
  /**
   * Name of the filter, e.g. First Name.
   */
  readonly name: string;

  /**
   * The name of the property must match the name of the filter object,
   * e.g., public_id within FilterPatientsDto.
   */
  readonly filter: string;

  /**
   * Type of the filter.
   */
  readonly type: EFilterType;

  /**
   * Crate features to be activated.
   */
  readonly options?: IFilterOptions;

  /**
   * Additional information to be retrieved by a custom specification.
   */
  readonly resource?: IFilterResource;
}

/**
 * Interface to store filter data from html elements.
 */
export interface IFilterData extends Omit<IFilter, 'resource'> {
  /**
   * Original value of the filter object.
   */
  value?: any;

  /**
   * Parsed value of the filter which is sent to the backend side.
   */
  parsedValue?: string;

  /**
   * Value displayed within the html.
   */
  content?: string;
}

/**
 * Interface used to store options related to filter.
 */
export interface IFilterOptions {
  /**
   * Specifies if the filter can be used many times.
   */
  readonly isMultiple: boolean;
}

/**
 * Interface used to store data of a filter retrieved from a service or custom specification.
 */
export interface IFilterResource {
  /**
   * Callback used as a function used to retrieved data by custom specification.
   */
  readonly callback?: (...arg: any) => { id: string; content: string }[];
}

/**
 * The different types of filters.
 */
export enum EFilterType {
  TextType = 'text',
  BooleanType = 'boolean',
  SelectType = 'select',
  DateType = 'date',
  TimeType = 'time',
  NumberType = 'number',
}
