import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { EGender } from '@common-enums/gender.enum';
import { PatientsService } from '@client-services/patients.service';
import { FullPatientDto } from '@common-response-dto/full-patient.dto';
import { RoutinesService } from '@client-services/routines.service';
import { FullRoutineDto } from '@common-response-dto/full-routine.dto';
import { dateToLocalISOString } from '@common/utils/date-utils';
import { debounceTime, filter, map, switchMap, tap } from 'rxjs/operators';
import { RoutineDetailsForListDtoData } from '@common-response-dto/routine-details-for-list.dto';
import { isDefined } from '@common/utils/is-defined';
import { stringsConfig } from '@config/strings.config';
import { appConfig } from '@config/app.config';
import { EPermission, EPermissionAction } from '@common/permissions';
import { ConfirmDialogService } from '@client-services/confirm-dialog.service';
import { EStrokeSide } from '@common-enums/stroke-side.enum';

type TState = {
  heading: string;
  subheading: string;
  headingIcon: string;
  isLoading: boolean;
  editing: boolean;
  patientForm: FormGroup;
  subscription: Subscription;
  patient: FullPatientDto | null;
  routine: RoutineDetailsForListDtoData | null;
};

@Component({
  selector: 'app-patient-profile',
  templateUrl: './patient-profile.component.html',
  styleUrls: ['./patient-profile.component.scss'],
})
export class PatientProfileComponent implements OnInit, OnDestroy {
  state: TState = {
    heading: `Patient's profile`,
    subheading: 'Manage the patient information',
    headingIcon: 'person',
    editing: false,
    isLoading: false,
    patient: null,
    routine: null,
    patientForm: new FormGroup({}),
    subscription: new Subscription(),
  };

  imports = {
    Object,
    EGender,
    EStrokeSide,
  };

  searchRoutineName = new FormControl();
  filteredRoutines: RoutineDetailsForListDtoData[] = [];

  displayRoutineName = (routine: RoutineDetailsForListDtoData): string => {
    return routine?.name || '';
  };

  deletePermissions = [
    { id: EPermission.ManagePatients, actions: [EPermissionAction.Delete] },
  ];
  editPermissions = [
    { id: EPermission.ManagePatients, actions: [EPermissionAction.Edit] },
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private toastrService: ToastrService,
    private confirmDialogService: ConfirmDialogService,
    private patientsService: PatientsService,
    private routinesService: RoutinesService
  ) {}

  ngOnInit(): void {
    this.state.patientForm = this.fb.group({
      nickname: [undefined, [Validators.required]],
      email: [undefined, [Validators.email]],
      birthdate: [undefined, []],
      gender: [undefined, [Validators.required]],
      strokeSide: [undefined, [Validators.required]],
      mobility: [undefined, [Validators.required]],
      preferSelfDescribe: [undefined, []],
      token: [undefined, []],
      routineName: [undefined, []],
      routineId: [undefined, []],
    });

    this.state.patientForm.get('token')?.disable();

    // Update the options in the autocomplete component
    this.state.subscription.add(
      this.searchRoutineName.valueChanges
        .pipe(
          filter((value) => typeof value === 'string'),
          debounceTime(300),
          switchMap((searchText: string) => {
            const trimmed = searchText?.trim().toLowerCase();
            return this.routinesService.list({
              data: { name: trimmed || undefined },
              metadata: { page: 0, pageSize: 10 },
            });
          }),
          map((response) => response.data)
        )
        .subscribe((routines) => {
          this.filteredRoutines = routines;
        })
    );

    // Preload initial routines for autocomplete
    this.state.subscription.add(
      this.routinesService
        .list({ metadata: { page: 0, pageSize: 20 } } as any)
        .pipe(map((response) => response.data))
        .subscribe((routines) => {
          this.filteredRoutines = routines;
        })
    );

    if (this.route.snapshot.params.id) {
      this.loadPatientToForm(this.route.snapshot.params.id);
    }
  }

  loadPatientToForm(patientId: string): void {
    this.state.subscription.add(
      this.patientsService
        .fetch(patientId)
        .pipe(
          tap((patient: FullPatientDto) => {
            // Load patient data
            this.state.patient = patient;
            this.restoreFormData();
          }),
          filter((patient) => isDefined(patient.routine_id)),
          switchMap((patient: FullPatientDto) =>
            this.routinesService.fetch(patient.routine_id)
          )
        )
        .subscribe(
          (routine: FullRoutineDto) => {
            // Load routine data
            if (routine) {
              this.state.routine = routine;
              this.restoreFormData();
            }
          },
          (error) => {
            this.state.isLoading = false;
            this.toastr.error(error.error.message || error.statusText);
          }
        )
        .add(async () => {
          await new Promise((f) =>
            setTimeout(f, appConfig.minimumLoadTimeInMs)
          );
          this.state.isLoading = false;
        })
    );
  }

  onSubmit(): void {
    if (!this.state.patientForm?.valid) {
      this.toastr.error('There are invalid fields');
      return;
    }

    this.state.isLoading = true;

    if (this.state.patient) {
      const email = this.state.patientForm.get('email')?.value;
      const birthDate = this.state.patientForm.get('birthdate')?.value;

      const formValue = this.searchRoutineName.value;
      let newRoutine: RoutineDetailsForListDtoData | undefined;
      let routineId: string | undefined;

      if (formValue && typeof formValue === 'object') {
        // User selected from autocomplete, or field was untouched
        newRoutine = formValue;
        routineId = formValue.id;
      } else if (typeof formValue === 'string' && formValue.trim()) {
        // User typed a name without selecting — try case-insensitive match
        newRoutine = this.filteredRoutines.find(
          (routine) =>
            routine.name.toLowerCase() === formValue.trim().toLowerCase()
        );
        if (!newRoutine) {
          this.toastr.error(
            'Please select a routine from the dropdown list',
            'Invalid routine'
          );
          this.state.isLoading = false;
          return;
        }
        routineId = newRoutine.id;
      } else {
        // Field is empty — user intentionally cleared the routine
        newRoutine = undefined;
        routineId = undefined;
      }

      this.state.subscription.add(
        this.patientsService
          .update(this.state.patient.id, {
            nickname: this.state.patientForm.get('nickname')?.value,
            email: email ? email : undefined,
            birth_date: birthDate ? dateToLocalISOString(birthDate) : undefined,
            gender: this.state.patientForm.get('gender')?.value,
            stroke_side: this.state.patientForm.get('strokeSide')?.value,
            mobility: this.state.patientForm.get('mobility')?.value,
            prefer_to_self_describe_text:
              this.state.patientForm.get('preferSelfDescribe')?.value,
            routine_id: routineId,
          })
          .subscribe(
            (result) => {
              if (result) {
                this.state.patient = result;
                this.state.routine = newRoutine || null;
                this.restoreFormData();
                this.toastr.success('Successfully updated patient');
              }
            },
            (error) => {
              this.toastr.error(error.error.message || error.statusText);
            }
          )
          .add(async () => {
            await new Promise((f) =>
              setTimeout(f, appConfig.minimumLoadTimeInMs)
            );
            this.state.isLoading = false;
          })
      );
    }
  }

  restoreFormData(): void {
    this.state.patientForm?.patchValue({
      nickname: this.state.patient?.nickname,
      email: this.state.patient?.email,
      birthdate: this.state.patient?.birth_date
        ? new Date(this.state.patient?.birth_date)
        : undefined,
      gender: this.state.patient?.gender,
      strokeSide: this.state.patient?.stroke_side,
      mobility: this.state.patient?.mobility,
      preferSelfDescribe: this.state.patient?.prefer_to_self_describe_text,
      token: this.state.patient?.access_token,
      routineId: this.state.routine?.id,
      routineName: this.state.routine?.name,
    });
    this.searchRoutineName.setValue(this.state.routine || null);
    this.state.editing = false;
  }

  get routineLink(): string {
    return `/${stringsConfig.clientRoutes.generalManager}/${stringsConfig.sections.generalManager.routines.path}/${stringsConfig.sections.generalManager.routines.routineDetails.path}`.replace(
      '/:id',
      `/${this.state.patientForm?.get('routineId')?.value}`
    );
  }

  async delete(): Promise<void> {
    if (
      !(await this.confirmDialogService.confirm(
        'Delete patient',
        'Are you sure you want to delete this patient?'
      ))
    ) {
      return;
    }

    if (!this.state.patient) {
      this.toastr.error('Delete patient', 'Cannot perform this operation');
      return;
    }

    this.state.isLoading = true;
    this.patientsService
      .delete(this.state.patient.id)
      .subscribe((deletedPatient) => {
        this.toastrService.success(
          `Patient ${deletedPatient.nickname} was successfully deleted`,
          'Patient deleted'
        );
        this.router.navigate(
          [
            `../../../${stringsConfig.sections.generalManager.patients.myPatients.path}`,
          ],
          { relativeTo: this.route }
        );
      })
      .add(() => (this.state.isLoading = false));
  }

  ngOnDestroy(): void {
    this.state.subscription.unsubscribe();
  }
}
