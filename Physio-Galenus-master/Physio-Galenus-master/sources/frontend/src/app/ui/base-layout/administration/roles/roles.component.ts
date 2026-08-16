import { Component, OnInit, ViewChild } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { MatSelect } from '@angular/material/select';
import { AuthService } from '@client-services/auth.service';
import { ConfirmDialogService } from '@client-services/confirm-dialog.service';
import { PermissionsService } from '@client-services/permissions.service';
import { RolesService } from '@client-services/roles.service';
import { UsersService } from '@client-services/users.service';
import { CreateRoleDto } from '@common-request-dto/create-role.dto';
import { UpdateRolePermissionsDto } from '@common-request-dto/update-role-permissions.dto';
import { UpdateUserRolesDto } from '@common-request-dto/update-user-roles.dto';
import { CategoryWithPermissionsDto } from '@common-response-dto/category-with-permissions.dto';
import { RoleWithPermissionsByCategoriesDto } from '@common-response-dto/role-with-permissions-by-categories.dto';
import { PermissionDto } from '@common/dto/types/permission.dto';
import { plainToClass } from 'class-transformer';
import * as _ from 'lodash';
import { ToastrService } from 'ngx-toastr';
import { logDebug, logError } from 'src/app/utils/log';

const ID_LENGTH = 15;

type TState = {
  heading: string;
  subheading: string;
  headingIcon: string;
  roleForm: FormGroup;
  isCreatingRole: boolean;
  _isLoading: boolean;
  selectedRole: RoleWithPermissionsByCategoriesDto;
  minimumLoadAnimMS: number;
  allRolesLoaded: boolean;
  allPermissionsLoaded: boolean;

  //All roles in database with their permissions group by permission_categories
  roles: RoleWithPermissionsByCategoriesDto[];
  //All permissions in database group by permission_categories
  categoriesWithPermissions: CategoryWithPermissionsDto[];
  // categories without selected permissions
  emptyRoleCategoriesPermission: CategoryWithPermissionsDto[];

  permissionToAdd: PermissionDto[];
  permissionToEdit: PermissionDto[];
  permissionToDelete: PermissionDto[];
};

@Component({
  selector: 'app-roles',
  templateUrl: './roles.component.html',
  styleUrls: ['./roles.component.scss'],
})
export class RolesComponent implements OnInit {
  @ViewChild('matSelectRole') matSelectRole: MatSelect;

  state: TState = {
    heading: 'Role Management',
    subheading: 'Manage existing roles or create new ones',
    headingIcon: 'security',
    roleForm: new FormGroup({}),
    roles: [],
    categoriesWithPermissions: [],
    isCreatingRole: false,
    _isLoading: false,
    selectedRole: undefined as unknown as RoleWithPermissionsByCategoriesDto,
    minimumLoadAnimMS: 500,
    allRolesLoaded: false,
    allPermissionsLoaded: false,
    emptyRoleCategoriesPermission: [],
    permissionToAdd: [],
    permissionToEdit: [],
    permissionToDelete: [],
  };

  constructor(
    private toastr: ToastrService,
    private rolesService: RolesService,
    private authService: AuthService,
    private permissionsService: PermissionsService,
    private dialogService: ConfirmDialogService,
    private fb: FormBuilder,
    private usersService: UsersService
  ) {}

  get isLoading(): boolean {
    return this.state._isLoading;
  }

  set isLoading(loading: boolean) {
    this.state._isLoading = loading;
  }

  ngOnInit(): void {
    this.state.roleForm = this.fb.group({
      roleId: new FormControl(
        { value: '', disabled: true },
        Validators.required
      ),
      roleName: new FormControl('', [
        Validators.required,
        Validators.maxLength(100),
      ]),
      roleDescription: new FormControl('', [
        Validators.required,
        Validators.maxLength(255),
      ]),
    });

    this.state.roleForm.get('roleName')?.valueChanges.subscribe((val) => {
      this.state.roleForm.get('roleId')?.setValue(this.formatID(val));
    });

    //Load data
    this.isLoading = true;
    this.rolesService.findAll({ data: { isHidden: false } }).subscribe({
      next: (roles: RoleWithPermissionsByCategoriesDto[]) => {
        logDebug('Roles retrieved', roles);
        this.state.roles = roles;
      },
      error: (err) => logError(err),
      complete: () => {
        this.state.allRolesLoaded = true;
        if (this.state.allRolesLoaded && this.state.allPermissionsLoaded) {
          setTimeout(() => {
            this.isLoading = false;
          }, this.state.minimumLoadAnimMS);
        }
      },
    });

    this.permissionsService.findAll().subscribe({
      next: (permissions: CategoryWithPermissionsDto[]) => {
        logDebug('Permissions retrieved', permissions);
        this.state.categoriesWithPermissions = permissions;
      },
      error: (err) => logError(err),
      complete: () => {
        this.state.allPermissionsLoaded = true;
        if (this.state.allRolesLoaded && this.state.allPermissionsLoaded) {
          setTimeout(() => {
            this.isLoading = false;
          }, this.state.minimumLoadAnimMS);
        }
      },
    });
  }

  updateUserCurrentRoles(): void {
    const user = this.authService.userSubject.value;
    const rolesIds: string[] = [];

    user.roles.forEach((role) => {
      rolesIds.push(role.id);
    });

    const urpdto = plainToClass(UpdateUserRolesDto, {
      ids: rolesIds,
    });

    this.usersService.updateUserRoles(urpdto, user.id).subscribe({
      next: (res) => {
        this.authService.userSubject.next(res);
      },
    });
  }
  //CREATING ROLE LISTENERS
  onSubmitCreateNewRole(newRoleForm: any): void {
    this.isLoading = true;

    const permissions: CategoryWithPermissionsDto[] = [];
    const newRole: RoleWithPermissionsByCategoriesDto = {
      id: this.formatID(newRoleForm.value.roleName),
      name: newRoleForm.value.roleName,
      description: newRoleForm.value.roleDescription,
      categories_with_permissions: permissions,
      read_only: false,
    };

    // Send the new role to the server
    const urpdto = plainToClass(CreateRoleDto, {
      id: newRole.id,
      name: newRole.name,
      description: newRole.description,
    });

    this.rolesService.create(urpdto).subscribe({
      next: (res) => {
        logDebug('Role: ' + newRole.id + ' added!');
        this.toastr.success('Role: ' + newRole.id + ' added!');
        this.state.selectedRole = _.cloneDeep(newRole);
        this.state.emptyRoleCategoriesPermission =
          this.state.categoriesWithPermissions.filter(
            (c) =>
              this.state.selectedRole.categories_with_permissions.findIndex(
                (cwp) => cwp.id === c.id
              ) === -1
          );
        this.state.permissionToAdd = [];
        this.state.permissionToEdit = [];
        this.state.permissionToDelete = [];
        this.state.roles.push(newRole);
        this.state.isCreatingRole = false;
        this.state.roleForm.reset();
        this.matSelectRole.writeValue(newRole.id);
      },
      error: (err) => {
        logError(err);
        this.toastr.error('A role with this name already exists.');
      },
      complete: () => {
        this.isLoading = false;
      },
    });
  }

  onCancel(): void {
    this.state.roleForm.reset();
    this.state.isCreatingRole = false;
  }

  onCreateNewRole(): void {
    this.state.isCreatingRole = true;
  }

  //ROLES LISTENERS
  async onChangeRole(event: any): Promise<void> {
    if (
      this.state.permissionToAdd.length > 0 ||
      this.state.permissionToEdit.length > 0 ||
      this.state.permissionToDelete.length > 0
    ) {
      if (
        !(await this.dialogService.confirm(
          'There are unsaved changes',
          'Are you sure you want to continue?'
        ))
      ) {
        event.source.value = this.state.selectedRole.id;
        return;
      }
    }
    this.state.isCreatingRole = false;
    if (event.value) {
      this.state.selectedRole = _.cloneDeep(
        this.state.roles.find((role) => role.id === event.value)
      ) as RoleWithPermissionsByCategoriesDto;
      this.state.emptyRoleCategoriesPermission =
        this.state.categoriesWithPermissions.filter(
          (c) =>
            this.state.selectedRole.categories_with_permissions.findIndex(
              (cwp) => cwp.id === c.id
            ) === -1
        );
    } else {
      this.state.selectedRole =
        undefined as unknown as RoleWithPermissionsByCategoriesDto;
      this.state.emptyRoleCategoriesPermission = [];
    }
    this.state.permissionToAdd = [];
    this.state.permissionToEdit = [];
    this.state.permissionToDelete = [];
  }

  async onDeleteSelectedRole(): Promise<void> {
    if (this.state.selectedRole !== undefined) {
      if (
        await this.dialogService.confirm(
          'Confirm',
          'Are you sure to delete the selected role?'
        )
      ) {
        this.isLoading = true;
        this.state.isCreatingRole = false;

        this.rolesService
          .delete(this.state.selectedRole.id)
          .subscribe({
            next: (res) => {
              logDebug('Role: ' + this.state.selectedRole.id + ' deleted!');
              this.toastr.success(
                'Role: ' + this.state.selectedRole.id + ' deleted!'
              );
              const index = this.state.roles.findIndex(
                (r) => r.id === this.state.selectedRole.id
              );
              if (index > -1) {
                this.state.roles.splice(index, 1);
              }
              this.state.selectedRole =
                undefined as unknown as RoleWithPermissionsByCategoriesDto;
              this.matSelectRole.writeValue(null);
            },
          })
          .add(
            () => (
              (this.isLoading = false), (this.state.isCreatingRole = false)
            )
          );
      }
    }
  }

  onSaveSelectedRole(): void {
    if (this.state.selectedRole !== undefined) {
      this.isLoading = true;
      const urpdto = plainToClass(UpdateRolePermissionsDto, {
        permissionToAdd: this.state.permissionToAdd,
        permissionToEdit: this.state.permissionToEdit,
        permissionToDelete: this.state.permissionToDelete,
      });
      this.rolesService
        .updateRolePermissions(urpdto, this.state.selectedRole.id)
        .subscribe({
          next: (role) => {
            this.updateUserCurrentRoles();
            logDebug('Permissions updated', role);
            this.toastr.success(`Role ${role.id} successfully updated.`);
            this.state.roles.splice(
              this.state.roles.findIndex((r) => r.id === role.id),
              1,
              role
            );
            this.state.permissionToAdd = [];
            this.state.permissionToEdit = [];
            this.state.permissionToDelete = [];
            this.state.selectedRole = role;
          },
          error: (err) => {
            logError('Error updating permissions', err);
            this.toastr.error(`Error updating permissions`);
          },
          complete: () => (this.isLoading = false),
        });
    }
  }

  //PERMISSIONS LISTENERS
  onChangeNewCategoryPermission(event: any): void {
    this.state.selectedRole.categories_with_permissions.push({
      ...event.value,
      permissions: [],
    });

    this.state.emptyRoleCategoriesPermission.splice(
      this.state.emptyRoleCategoriesPermission.findIndex(
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

  formatID(str: string): string {
    if (str !== null) {
      let code;
      let output = '';

      for (let i = 0; i < str.length; i++) {
        if (i < ID_LENGTH) {
          code = str.charCodeAt(i);
          if (
            (code < '0'.charCodeAt(0) || code > '9'.charCodeAt(0)) &&
            (code < 'A'.charCodeAt(0) || code > 'Z'.charCodeAt(0))
          ) {
            if (code === ' '.charCodeAt(0) || code === '_'.charCodeAt(0)) {
              output = output.concat('_');
            } else if (code >= 'a'.charCodeAt(0) && code <= 'z'.charCodeAt(0)) {
              output = output.concat(String.fromCharCode(code).toUpperCase());
            }
          } else {
            output = output.concat(String.fromCharCode(code));
          }
        }
      }

      let uniqueId = false;
      let suffix = 0;
      do {
        const found = this.state.roles.find(
          (element) => output.toUpperCase() === element.id.toUpperCase()
        );
        if (found !== undefined) {
          suffix++;
          const suffixString: string = suffix.toString();
          output = output.substring(0, output.length - suffixString.length);
          output = output.concat(suffixString);
        } else {
          uniqueId = true;
        }
      } while (!uniqueId);

      return output;
    }
    return '';
  }
}
