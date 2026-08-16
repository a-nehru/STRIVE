import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import {
  IPaginationData,
  IPaginationOptions,
} from '@common/interfaces/pagination.interface';
import { isDefined } from '@common/utils/is-defined';
import { Params, Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { paginationConfig } from '@config/pagination.config';
import { PageEvent } from '@angular/material/paginator';

@Component({
  selector: 'app-pagination',
  templateUrl: './pagination.component.html',
  styleUrls: ['./pagination.component.scss'],
  providers: [],
})
export class PaginationComponent implements OnInit {
  private _defaultPaginationData: IPaginationData = {
    page: 0,
    pages: 0,
    count: 0,
    pageSize: paginationConfig.defaultPageSize,
  };
  private _defaultPaginationOptions: IPaginationOptions = {
    disabled: false,
    hidePageSize: false,
    pageSizeOptions: paginationConfig.defaultPageSizeOptions,
  };

  @Input() urlChange = true;
  @Input() paginationData: IPaginationData;
  @Input() paginationOptions: IPaginationOptions;
  @Output() pageChange = new EventEmitter();

  queryParams: { [key: string]: any } = {};

  constructor(private router: Router, private activatedRoute: ActivatedRoute) {
    this.queryParams = this.activatedRoute.snapshot.queryParams;
  }

  ngOnInit(): void {
    if (this.urlChange) {
      const { page, pageSize } = this.queryParams;
      this.paginationData.page = page || this.paginationData.page;
      this.paginationData.pageSize = pageSize || this.paginationData.pageSize;
    }

    this.paginationData = {
      ...this._defaultPaginationData,
      ...this.paginationData,
    };

    this.paginationOptions = {
      ...this._defaultPaginationOptions,
      ...this.paginationOptions,
    };
  }

  onPageChange(pageEvent: PageEvent): void {
    if (!isDefined(this.paginationData?.pages)) {
      return;
    }

    if (this.urlChange) {
      const queryParams: Params = {
        page: pageEvent.pageIndex,
        pageSize: pageEvent.pageSize,
      };

      this.router.navigate([], {
        relativeTo: this.activatedRoute,
        queryParams,
        queryParamsHandling: 'merge',
      });
    }

    if (
      pageEvent.pageIndex < 0 ||
      pageEvent.pageIndex > this.paginationData.pages
    ) {
      return;
    }

    this.paginationData.page = pageEvent.pageIndex;
    this.paginationData.pageSize = pageEvent.pageSize;
    this.pageChange.emit();
  }
}
