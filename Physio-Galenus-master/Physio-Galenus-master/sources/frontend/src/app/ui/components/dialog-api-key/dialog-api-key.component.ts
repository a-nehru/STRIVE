import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { ApiKeysService } from '@client-services/api-keys.service';
import { UsersService } from '@client-services/users.service';
import { CreateApiKeyDto } from '@common-request-dto/create-api-key.dto';
import { UpdateApiKeyDto } from '@common-request-dto/update-api-key.dto';
import { ApiKeysListDtoData } from '@common-response-dto/api-keys-list.dto';
import { SimpleUserDtoData } from '@common-response-dto/user-simple-details-for-list.dto';
import { EApiKeyQuotaReset } from '@common/enums/api-key-quota-reset.enum';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { logDebug, logError } from 'src/app/utils/log';

type TState = {
  isLoading: boolean;
  quotaResetTypes: EApiKeyQuotaReset;
  users: SimpleUserDtoData[];
  upsertApiKeyForm: FormGroup;
  subscription: Subscription;
};

@Component({
  selector: 'app-dialog-api-key',
  templateUrl: './dialog-api-key.component.html',
  styleUrls: ['./dialog-api-key.component.scss'],
})
export class DialogApiKeyComponent implements OnInit, OnDestroy {
  imports = {
    EApiKeyQuotaReset,
  };

  @Input() apiKey: ApiKeysListDtoData;
  @Input() isEditing?: boolean;

  state: TState = {
    isLoading: false,
    quotaResetTypes: EApiKeyQuotaReset.None,
    users: [] as SimpleUserDtoData[],
    upsertApiKeyForm: new FormGroup({}),
    subscription: new Subscription(),
  };

  constructor(
    private dialogRef: MatDialogRef<DialogApiKeyComponent>,
    private readonly toastr: ToastrService,
    private readonly fb: FormBuilder,
    private readonly apiKeysService: ApiKeysService,
    private readonly usersService: UsersService
  ) {}

  ngOnInit(): void {
    this.state.isLoading = true;

    this.state.upsertApiKeyForm = this.fb.group({
      username: [null, Validators.required],
      isRevoked: [null],
      description: [null],
      quota: [null],
      quotaReset: [null],
    });

    if (!this.isEditing) {
      this.state.subscription.add(
        this.usersService
          .findSimple()
          .subscribe({
            next: (users: SimpleUserDtoData[]) => {
              logDebug('Users retrieved', users);
              this.state.users = users;
            },
            error: (err) => logError(err),
          })
          .add(() => {
            this.state.isLoading = false;
          })
      );
    } else {
      this.state.users.push({
        id: '',
        username: this.apiKey.username,
      });
      this.state.upsertApiKeyForm.patchValue({
        username: this.apiKey.username,
        isRevoked: this.apiKey.is_revoked,
        description: this.apiKey.description,
        quota: this.apiKey.quota,
        quotaReset: this.apiKey.quota_reset,
      });
      this.state.isLoading = false;
    }
  }

  onSubmit(): void {
    if (this.state.upsertApiKeyForm.invalid) {
      this.toastr.error(
        'There are errors in the form, please, review the fields again.'
      );
      return;
    }

    this.state.isLoading = true;
    const quotaValue = this.state.upsertApiKeyForm.get('quota')?.value;
    if (this.isEditing) {
      const editApiKey: UpdateApiKeyDto = {
        data: {
          is_revoked:
            this.state.upsertApiKeyForm.get('isRevoked')?.value || false,
          description: this.state.upsertApiKeyForm.get('description')?.value,
          quota: quotaValue?.toString(),
          quota_reset:
            this.state.upsertApiKeyForm.get('quotaReset')?.value ||
            EApiKeyQuotaReset.None,
        },
      };
      this.state.subscription.add(
        this.apiKeysService
          .update(this.apiKey.id, editApiKey)
          .subscribe({
            next: (apiKeySaved) => {
              this.dialogRef.close(apiKeySaved);
            },
          })
          .add(() => (this.state.isLoading = false))
      );
    } else {
      const createApiKey: CreateApiKeyDto = {
        data: {
          userId: this.state.upsertApiKeyForm.get('username')?.value,
          is_revoked:
            this.state.upsertApiKeyForm.get('isRevoked')?.value || false,
          description: this.state.upsertApiKeyForm.get('description')?.value,
          quota: quotaValue?.toString(),
          quota_reset:
            this.state.upsertApiKeyForm.get('quotaReset')?.value ||
            EApiKeyQuotaReset.None,
        },
      };
      this.state.subscription.add(
        this.apiKeysService
          .create(createApiKey)
          .subscribe({
            next: (apiKeySaved) => {
              this.dialogRef.close(apiKeySaved);
            },
          })
          .add(() => (this.state.isLoading = false))
      );
    }
  }

  ngOnDestroy(): void {
    this.state.subscription.unsubscribe();
  }
}
