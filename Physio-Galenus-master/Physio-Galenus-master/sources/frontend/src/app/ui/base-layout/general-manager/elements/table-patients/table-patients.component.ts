import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FullUserDto } from '@common/dto/response/full-user.dto';
import { valueOrUnavailable } from '@common-utils/variable-utils';
import { formatClientPublicId } from '@common-utils/string-utils';
import { AuthService } from '@client-services/auth.service';
import {
  PatientDetailsForListDto,
  PatientDetailsForListDtoData,
} from '@common-response-dto/patient-details-for-list.dto';
import { stringsConfig } from '@config/strings.config';
import {
  checkPermissions,
  EPermission,
  EPermissionAction,
  IPermission,
} from '@common/permissions';
import { PatientsService } from '@client-services/patients.service';
import { ConfirmDialogService } from '@client-services/confirm-dialog.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-table-patients',
  templateUrl: './table-patients.component.html',
  styleUrls: ['./table-patients.component.scss'],
})
export class TablePatientsComponent {
  private _isLoading = false;

  user: FullUserDto;

  patientList: PatientDetailsForListDto;
  selectedClient: PatientDetailsForListDtoData;

  @Input() activateViewDetails = true;
  @Input() activateSelectClient = false;
  @Input() activateRemoveFromListClient = false;
  @Input() activateRouteDetails = false;
  @Input() activateSmsModalClient = false;

  @Output() deleteEvent = new EventEmitter<void>();

  imports = {
    valueOrUnavailable,
    formatClientPublicId,
  };

  deletePatientPermissions = [
    { id: EPermission.ManagePatients, actions: [EPermissionAction.Delete] },
  ];

  constructor(
    private toastrService: ToastrService,
    private authService: AuthService,
    private patientsService: PatientsService,
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

  loadPatientDetails(id: string): void {
    // TO DO: patient details page
  }

  updatePatientList(patients: PatientDetailsForListDto): void {
    this.patientList = patients;
  }

  hasPermissions(permissionList: IPermission[]): boolean {
    const permissions = checkPermissions(this.user, permissionList);
    return permissions.length === 0;
  }

  getPatientUrl(patientId: string): string {
    return `/${stringsConfig.clientRoutes.generalManager}/${stringsConfig.sections.generalManager.patients.path}/${stringsConfig.sections.generalManager.patients.patientProfile.path}`.replace(
      '/:id',
      `/${patientId}`
    );
  }

  async deletePatient(patientId: string): Promise<void> {
    if (
      !(await this.confirmDialogService.confirm(
        'Delete patient',
        'Are you sure you want to delete this patient?'
      ))
    ) {
      return;
    }

    this.isLoading = true;
    this.patientsService
      .delete(patientId)
      .subscribe((deletedPatient) =>
        this.toastrService.success(
          `Patient ${deletedPatient.nickname} was successfully deleted`,
          'Patient deleted'
        )
      )
      .add(() => ((this.isLoading = false), this.deleteEvent.emit()));
  }
}
