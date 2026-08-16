export interface IPagination {
  page?: number; // Page to select, starting with 1
  pageSize?: number; // Amount of items requested per page
}

export interface IPaginationData extends IPagination {
  totalCount?: number; // Amount of items in the database (matching or not matching the filter)
  count?: number; // Amount of items in matching the filter
  perPageCount?: number; // Amount of actual items in page
  pages?: number; // Amount of pages matching the filter
}

/**
 * Adapter for mat-paginator options
 */
export interface IPaginationOptions {
  pageSizeOptions?: number[]; // The set of provided page size options to display to the user
  hidePageSize?: boolean; // Whether to hide the page size selection UI from the user
  disabled?: boolean; // Whether the component is disabled
}

export interface IPaginatedEntities<T> {
  entities: T[];
  pagination: IPaginationData;
}

export interface IPaginatedComponent {
  paginationData: IPaginationData;
  onPageChange: () => void;
}
