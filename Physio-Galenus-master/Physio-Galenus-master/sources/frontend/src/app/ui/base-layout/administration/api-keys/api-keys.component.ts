import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ApiKeysService } from '@client-services/api-keys.service';
import { ConfirmDialogService } from '@client-services/confirm-dialog.service';
import { FilterApiKeysDto } from '@common-request-dto/filter-api-keys.dto';
import { ApiKeysListDtoData } from '@common/dto/response/api-keys-list.dto';
import {
  IPaginationData,
  IPaginationOptions,
} from '@common/interfaces/pagination.interface';
import { EPermission, EPermissionAction } from '@common/permissions';
import { capitalize } from '@common/utils/string-utils';
import { paginationConfig } from '@config/pagination.config';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { FilterSearch } from 'src/app/filter/filter-search';
import { IFilterData } from 'src/app/filter/filter-types';
import { DialogApiKeyComponent } from 'src/app/ui/components/dialog-api-key/dialog-api-key.component';
import { filterApiKeys } from './filter-api-keys';

type TState = {
  isLoading: boolean;
  heading: string;
  subheading: string;
  icon: string;
  subscription: Subscription;
  apiKeysListDto: ApiKeysListDtoData[];
  filterSearch: FilterSearch;
};

@Component({
  selector: 'app-api-keys',
  templateUrl: './api-keys.component.html',
  styleUrls: ['./api-keys.component.scss'],
})
export class ApiKeysComponent implements OnInit, OnDestroy {
  state: TState = {
    isLoading: false,
    heading: 'API Keys',
    subheading: 'Manage API Keys',
    icon: 'vpn_key',
    subscription: new Subscription(),
    apiKeysListDto: [] as ApiKeysListDtoData[],
    filterSearch: new FilterSearch(),
  };

  imports = {
    capitalize,
    filterCriteria: filterApiKeys,
  };

  paginationData: IPaginationData = {
    pageSize: paginationConfig.defaultPageSize,
    page: 0,
  };
  paginationOptions: IPaginationOptions = {
    pageSizeOptions: paginationConfig.defaultPageSizeOptions,
  };

  permissionEditApiKey = [
    { id: EPermission.ManageApiKeys, actions: [EPermissionAction.Edit] },
  ];
  permissionDeleteApiKey = [
    { id: EPermission.ManageApiKeys, actions: [EPermissionAction.Delete] },
  ];
  permissionCreateApiKey = [
    { id: EPermission.ManageApiKeys, actions: [EPermissionAction.Create] },
  ];

  constructor(
    private apiKeysService: ApiKeysService,
    private toastr: ToastrService,
    private dialogService: ConfirmDialogService,
    private dialog: MatDialog
  ) {
    this.state.filterSearch.filterDto = new FilterApiKeysDto();
  }

  private onCreateFilters(filters: IFilterData[]): void {
    this.state.filterSearch.filterDto = {
      data: {},
    } as FilterApiKeysDto;
    this.state.filterSearch.populateFilterDto(filters);
  }

  ngOnInit(): void {
    this.onRefresh();
  }

  // FILTER API KEYS

  onChange(): void {
    this.onRefresh();
  }

  onPageChange(): void {
    this.onRefresh();
  }

  updateApiKeysList(filters: IFilterData[]): void {
    this.onCreateFilters(filters);
    this.onRefresh();
  }

  onRefresh(): void {
    this.state.filterSearch.filterDto = {
      data: {
        ...this.state.filterSearch.filterDto.data,
      },
      metadata: {
        ...this.paginationData,
      },
    };

    this.state.isLoading = true;
    this.state.subscription.add(
      this.apiKeysService
        .list(this.state.filterSearch.filterDto)
        .subscribe((apiKeysListDto) => {
          this.paginationData = apiKeysListDto.metadata ?? this.paginationData;
          this.state.apiKeysListDto =
            apiKeysListDto.data ?? this.state.apiKeysListDto;
        })
        .add(() => (this.state.isLoading = false))
    );
  }

  // CRUD OPERATIONS

  async onDelete(id: string): Promise<void> {
    if (
      await this.dialogService.confirm(
        'Delete Api Key',
        'Are you sure that you want to delete this API Key?'
      )
    ) {
      this.state.isLoading = true;
      this.state.subscription.add(
        this.apiKeysService
          .delete(id)
          .subscribe(() => {
            this.state.apiKeysListDto = this.state.apiKeysListDto.filter(
              (k) => k.id !== id
            );
            this.toastr.success('', 'API Key deleted succesfully');
          })
          .add(() => (this.state.isLoading = false))
      );
    }
  }

  async onEdit(apiKey: ApiKeysListDtoData): Promise<void> {
    const modalRef = this.dialog.open(DialogApiKeyComponent, {
      width: '800px',
    });
    modalRef.componentInstance.apiKey = apiKey;
    modalRef.componentInstance.isEditing = true;
    modalRef.afterClosed().subscribe((updatedApiKey) => {
      if (updatedApiKey) {
        const index = this.state.apiKeysListDto.findIndex(
          (n) => n.id === apiKey.id
        );
        this.state.apiKeysListDto[index] = updatedApiKey.data;
        this.toastr.success('', 'API Key updated succesfully');
      }
    });
  }

  async onCreate(): Promise<void> {
    const modalRef = this.dialog.open(DialogApiKeyComponent, {
      width: '800px',
    });
    modalRef.afterClosed().subscribe((createdApiKey) => {
      if (createdApiKey) {
        this.state.apiKeysListDto.push(createdApiKey.data);
        this.toastr.success('', 'API Key created succesfully');
      }
    });
  }

  ngOnDestroy(): void {
    this.state.subscription.unsubscribe();
  }
}
