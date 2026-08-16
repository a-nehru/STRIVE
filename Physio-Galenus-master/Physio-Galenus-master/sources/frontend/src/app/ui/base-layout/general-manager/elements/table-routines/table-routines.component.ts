import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { FullUserDto } from '@common/dto/response/full-user.dto';
import { AuthService } from '@client-services/auth.service';
import { stringsConfig } from '@config/strings.config';
import {
  RoutineDetailsForListDto,
  RoutineDetailsForListDtoData,
} from '@common-response-dto/routine-details-for-list.dto';
import {
  checkPermissions,
  EPermission,
  EPermissionAction,
  IPermission,
} from '@common/permissions';
import { ConfirmDialogService } from '@client-services/confirm-dialog.service';
import { ToastrService } from 'ngx-toastr';
import { RoutinesService } from '@client-services/routines.service';

@Component({
  selector: 'app-table-routines',
  templateUrl: './table-routines.component.html',
  styleUrls: ['./table-routines.component.scss'],
})
export class TableRoutinesComponent implements OnInit {
  private _isLoading = false;

  user: FullUserDto;

  routineList: RoutineDetailsForListDto;
  selectedRoutine: RoutineDetailsForListDtoData;

  @Output() deleteEvent = new EventEmitter<void>();

  deleteRoutinePermissions = [
    { id: EPermission.ManagePatients, actions: [EPermissionAction.Delete] },
  ];

  updateRoutinePermissions = [
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Edit] },
  ];

  adjustDifficultyPermissions = [
    {
      id: EPermission.SectionRoutinesAdjustDifficulty,
      actions: [EPermissionAction.Read],
    },
  ];

  constructor(
    public router: Router,
    private authService: AuthService,
    private routinesService: RoutinesService,
    private toastrService: ToastrService,
    private confirmDialogService: ConfirmDialogService
  ) {
    this.user = this.authService.userSubject.value;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  set isLoading(loading: boolean) {
    this._isLoading = loading;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  ngOnInit(): void {}

  updateRoutineList(routines: RoutineDetailsForListDto): void {
    this.routineList = routines;
  }

  hasPermissions(permissionList: IPermission[]): boolean {
    const permissions = checkPermissions(this.user, permissionList);
    return permissions.length === 0;
  }

  getRoutineUrl(routineId: string): string {
    return `/${stringsConfig.clientRoutes.generalManager}/${stringsConfig.sections.generalManager.routines.path}/${stringsConfig.sections.generalManager.routines.routineDetails.path}`.replace(
      '/:id',
      `/${routineId}`
    );
  }

  async deleteRoutine(routineId: string): Promise<void> {
    if (
      !(await this.confirmDialogService.confirm(
        'Delete routine',
        'Are you sure you want to delete this routine?'
      ))
    ) {
      return;
    }

    this.isLoading = true;
    this.routinesService
      .delete(routineId)
      .subscribe((deletedRoutine) =>
        this.toastrService.success(
          `Routine ${deletedRoutine.name} was successfully deleted`,
          'Routine deleted'
        )
      )
      .add(() => ((this.isLoading = false), this.deleteEvent.emit()));
  }

  getAdjustDifficultyUrl(routineId: string): string {
    return `/${stringsConfig.clientRoutes.generalManager}/${stringsConfig.sections.generalManager.routines.path}/${stringsConfig.sections.generalManager.routines.routineAdjustDifficulty.path}`.replace(
      '/:id',
      `/${routineId}`
    );
  }
}
