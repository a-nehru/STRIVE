import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { AuthService } from '@client-services/auth.service';
import { ConfirmDialogService } from '@client-services/confirm-dialog.service';
import { PermissionsService } from '@client-services/permissions.service';
import { RolesService } from '@client-services/roles.service';
import { UsersService } from '@client-services/users.service';
import { UpdateUserRolesDto } from '@common-request-dto/update-user-roles.dto';
import { CategoryWithPermissionsDto } from '@common-response-dto/category-with-permissions.dto';
import { FullUserDto } from '@common-response-dto/full-user.dto';
import { RoleWithPermissionsByCategoriesDto } from '@common-response-dto/role-with-permissions-by-categories.dto';
import { PermissionDto } from '@common/dto/types/permission.dto';
import { plainToClass } from 'class-transformer';
import * as _ from 'lodash';
import { ToastrService } from 'ngx-toastr';
import { logDebug, logError } from 'src/app/utils/log';
import { UpdateUserPermissionsDto } from '@common-request-dto/update-user-permissions.dto';
import { SimpleUserDtoData } from '@common-response-dto/user-simple-details-for-list.dto';

type TState = {
  // Heading
  heading: string;
  subheading: string;
  headingIcon: string;
  // Misc
  _isLoading: boolean;
  selectedUser: FullUserDto;
  selectedRolesForm: FormControl;
  //All users with permissions
  users: SimpleUserDtoData[];
  //All roles in database with their permissions group by permission_categories
  roles: RoleWithPermissionsByCategoriesDto[];
  //All permissions in database group by permission_categories
  categoriesWithPermissions: CategoryWithPermissionsDto[];
  // categories without selected permissions
  emptyUserCategoriesPermission: CategoryWithPermissionsDto[];
  permissionToAdd: PermissionDto[];
  permissionToEdit: PermissionDto[];
  permissionToDelete: PermissionDto[];
  // The user who is making changes
  currentUser: FullUserDto | undefined;
};
@Component({
  selector: 'app-user-policies',
  templateUrl: './user-policies.component.html',
  styleUrls: ['./user-policies.component.scss'],
})
export class UserPoliciesComponent implements OnInit {
  state: TState = {
    heading: 'Users Management',
    subheading: 'Assign permissions and roles to users',
    headingIcon: 'people',
    _isLoading: false,
    selectedUser: undefined as unknown as FullUserDto,
    selectedRolesForm: new FormControl(),
    users: [],
    roles: [],
    categoriesWithPermissions: [],
    emptyUserCategoriesPermission: [],
    permissionToAdd: [],
    permissionToEdit: [],
    permissionToDelete: [],
    currentUser: undefined,
  };

  constructor(
    private toastr: ToastrService,
    private authService: AuthService,
    private rolesService: RolesService,
    private permissionsService: PermissionsService,
    private dialogService: ConfirmDialogService,
    private usersService: UsersService
  ) {
    this.state.currentUser = this.authService.userSubject.value;
  }

  get isLoading(): boolean {
    return this.state._isLoading;
  }

  set isLoading(loading: boolean) {
    this.state._isLoading = loading;
  }

  ngOnInit(): void {
    this.isLoading = true;

    this.rolesService.findAll({ data: { isHidden: false } }).subscribe({
      next: (roles: RoleWithPermissionsByCategoriesDto[]) => {
        logDebug('Roles retrieved', roles);
        this.state.roles = roles;
      },
      error: (err) => logError(err),
    });

    this.permissionsService.findAll().subscribe({
      next: (permissions: CategoryWithPermissionsDto[]) => {
        logDebug('Permissions retrieved', permissions);
        this.state.categoriesWithPermissions = permissions;
      },
      error: (err) => logError(err),
    });

    this.usersService.findSimple().subscribe({
      next: (users: SimpleUserDtoData[]) => {
        logDebug('Users retrieved', users);
        this.state.users = users;
      },
      error: (err) => logError(err),
      complete: () => {
        this.isLoading = false;
      },
    });
  }

  async onChangeUser(event: any): Promise<void> {
    if (
      this.state.permissionToAdd.length > 0 ||
      this.state.permissionToEdit.length > 0 ||
      this.state.permissionToDelete.length > 0 ||
      this.state.selectedRolesForm.dirty
    ) {
      if (
        !(await this.dialogService.confirm(
          'There are unsaved changes',
          'Are you sure you want to continue?'
        ))
      ) {
        event.source.value = this.state.selectedUser.id;
        return;
      }
    }
    if (event.value) {
      this.isLoading = true;
      this.usersService.fetch(event.value).subscribe({
        next: (user: FullUserDto) => {
          logDebug('User retrieved', user);
          this.state.selectedUser = user;
          this.state.emptyUserCategoriesPermission =
            this.state.categoriesWithPermissions.filter(
              (c) =>
                this.state.selectedUser.categories_with_permissions.findIndex(
                  (cwp) => cwp.id === c.id
                ) === -1
            );
          this.state.selectedRolesForm.setValue(
            this.state.selectedUser.roles.map((r) => r.id)
          );
        },
        error: (err) => logError(err),
        complete: () => {
          this.isLoading = false;
        },
      });
    } else {
      this.state.selectedUser = undefined as unknown as FullUserDto;
      this.state.emptyUserCategoriesPermission = [];
    }

    this.state.selectedRolesForm.markAsPristine();
    this.state.permissionToAdd = [];
    this.state.permissionToEdit = [];
    this.state.permissionToDelete = [];
  }

  onSaveSelectedUser(): void {
    if (this.state.selectedUser !== undefined) {
      this.isLoading = true;
      const urpdto = plainToClass(UpdateUserPermissionsDto, {
        permissionToAdd: this.state.permissionToAdd,
        permissionToEdit: this.state.permissionToEdit,
        permissionToDelete: this.state.permissionToDelete,
      });
      this.usersService
        .updateUserPermissions(urpdto, this.state.selectedUser.id)
        .subscribe({
          next: (user) => {
            logDebug('User permissions updated', user);
            this.toastr.success(
              `Permissions of ${user.username} successfully updated.`
            );
            if (
              this.state.currentUser !== null &&
              this.state.selectedUser !== null
            ) {
              if (this.state.currentUser?.id === this.state.selectedUser.id) {
                this.authService.userSubject.next(user);
                this.state.currentUser = this.authService.userSubject.value;
              }
            }
            this.state.permissionToAdd = [];
            this.state.permissionToEdit = [];
            this.state.permissionToDelete = [];
            this.state.selectedUser = user;
          },
          error: (err) => {
            logError('Error updating permissions', err);
            this.toastr.error(`Error updating permissions`);
          },
          complete: () => (this.isLoading = false),
        });
    }
  }

  onSaveRoleChanges(): void {
    if (this.state.selectedUser !== undefined) {
      this.isLoading = true;

      const urpdto = plainToClass(UpdateUserRolesDto, {
        ids: this.state.selectedRolesForm.value,
      });

      this.usersService
        .updateUserRoles(urpdto, this.state.selectedUser.id)
        .subscribe({
          next: (user) => {
            logDebug('User roles updated', user);
            this.toastr.success(
              `Roles of ${user.username} successfully updated.`
            );
            if (
              this.state.currentUser !== null &&
              this.state.selectedUser !== null
            ) {
              if (this.state.currentUser?.id === this.state.selectedUser.id) {
                this.authService.userSubject.next(user);
                this.state.currentUser = this.authService.userSubject.value;
              }
            }
            this.state.selectedUser = user;
            this.state.selectedRolesForm.markAsPristine();
          },
          error: (err) => {
            logError('Error updating user roles', err);
            this.toastr.error(`Error updating roles`);
          },
          complete: () => (this.isLoading = false),
        });
    }
  }

  //PERMISSIONS LISTENERS
  onChangeNewCategoryPermission(event: any): void {
    this.state.selectedUser.categories_with_permissions.push({
      ...event.value,
      permissions: [],
    });

    this.state.emptyUserCategoriesPermission.splice(
      this.state.emptyUserCategoriesPermission.findIndex(
        (c) => c.id === event.value.id
      ),
      1
    );
    event.source.writeValue(null);
  }

  onChangeNewPermissionToCategory(
    event: any,
    cat: CategoryWithPermissionsDto
  ): void {
    const newPermission = {
      id: event.value.id,
      description: event.value.description,
      name: event.value.name,
      can_create: event.value.can_create ? false : undefined,
      can_edit: event.value.can_edit ? false : undefined,
      can_delete: event.value.can_delete ? false : undefined,
      can_read: event.value.can_read ? false : undefined,
      can_list: event.value.can_list ? false : undefined,
    };
    cat.permissions.push(newPermission);
    event.source.writeValue(null);

    const indexPermissionDeleted = this.state.permissionToDelete.findIndex(
      (p) => p.id === newPermission.id
    );
    if (indexPermissionDeleted !== -1) {
      this.state.permissionToDelete.splice(indexPermissionDeleted, 1);
      this.state.permissionToEdit.push(newPermission);
    } else {
      this.state.permissionToAdd.push(newPermission);
    }
  }

  async onDeletePermission(
    per: PermissionDto,
    cat: CategoryWithPermissionsDto
  ): Promise<void> {
    if (
      await this.dialogService.confirm(
        'Confirm',
        `Are you sure to delete '${per.name}' permission?`
      )
    ) {
      cat.permissions.splice(
        cat.permissions.findIndex((p) => p.id === per.id),
        1
      );

      const indexPermissionToEdit = this.state.permissionToEdit.findIndex(
        (p) => p.id === per.id
      );
      if (indexPermissionToEdit !== -1) {
        this.state.permissionToEdit.splice(indexPermissionToEdit, 1);
      }

      const indexPermissionToAdd = this.state.permissionToAdd.findIndex(
        (p) => p.id === per.id
      );
      if (indexPermissionToAdd !== -1) {
        this.state.permissionToAdd.splice(indexPermissionToAdd, 1);
      } else {
        this.state.permissionToDelete.push(per);
      }
    }
  }

  onChangePermissionAction(per: PermissionDto): void {
    const indexPermissionToAdd = this.state.permissionToAdd.findIndex(
      (p) => p.id === per.id
    );
    const indexPermissionToEdit = this.state.permissionToEdit.findIndex(
      (p) => p.id === per.id
    );
    if (indexPermissionToEdit === -1 && indexPermissionToAdd === -1) {
      this.state.permissionToEdit.push(per);
    }

    const indexPermissionDeleted = this.state.permissionToDelete.findIndex(
      (p) => p.id === per.id
    );
    if (indexPermissionDeleted !== -1) {
      this.state.permissionToDelete.splice(indexPermissionDeleted, 1);
    }
  }

  // AUXILIAR FUNCTIONS
  getNPermissionOfCategory(cat: CategoryWithPermissionsDto): number {
    return this.state.categoriesWithPermissions.find((c) => c.id === cat.id)
      ?.permissions.length as number;
  }

  getPermissionsNotAdded(
    cat: CategoryWithPermissionsDto
  ): PermissionDto[] | undefined {
    const fullCategory = this.state.categoriesWithPermissions.find(
      (c) => c.id === cat.id
    );
    const permissionsNotAdded = fullCategory?.permissions.filter(
      (p) => cat.permissions.findIndex((per) => per.id === p.id) === -1
    );
    return permissionsNotAdded;
  }
}
