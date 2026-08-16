import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PatientsService } from '@client-services/patients.service';
import { EGender } from '@common-enums/gender.enum';
import { FullPatientDto } from '@common-response-dto/full-patient.dto';
import { stringsConfig } from '@config/strings.config';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { dateToLocalISOString } from '@common/utils/date-utils';
import { EPermission, EPermissionAction } from '@common/permissions';
import { EStrokeSide } from '@common-enums/stroke-side.enum';

type TState = {
  heading: string;
  subheading: string;
  headingIcon: string;
  registerPatientForm: FormGroup;
  subscription: Subscription;
};

@Component({
  selector: 'app-register-patient',
  templateUrl: './register-patient.component.html',
  styleUrls: ['./register-patient.component.scss'],
})
export class RegisterPatientComponent implements OnInit {
  state: TState = {
    heading: 'Register a patient',
    subheading: `Add patient's information to the system`,
    headingIcon: 'person_add',
    registerPatientForm: new FormGroup({}),
    subscription: new Subscription(),
  };

  imports = {
    Object,
    EGender,
    EStrokeSide,
  };

  addPatientPermission = [
    { id: EPermission.ManagePatients, actions: [EPermissionAction.Create] },
  ];

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private patientService: PatientsService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.state.registerPatientForm = this.fb.group({
      nickname: [undefined, [Validators.required]],
      username: [undefined, [Validators.email]],
      birthdate: [undefined, [Validators.required]],
      gender: [undefined, [Validators.required]],
      strokeSide: [undefined, [Validators.required]],
      mobility: [50, [Validators.required]],
      preferSelfDescribe: ['', []],
    });
  }

  async onSubmit(): Promise<void> {
    if (this.state.registerPatientForm.invalid) {
      this.toastr.error('There are invalid fields');
      return;
    }

    this.state.subscription.add(
      this.patientService
        .insert({
          nickname: this.state.registerPatientForm.get('nickname')?.value,
          gender: this.state.registerPatientForm.get('gender')?.value,
          stroke_side: this.state.registerPatientForm.get('strokeSide')?.value,
          mobility: this.state.registerPatientForm.get('mobility')?.value,
          email: this.state.registerPatientForm.get('username')?.value,
          birth_date: dateToLocalISOString(
            this.state.registerPatientForm.get('birthdate')?.value
          ),
          prefer_to_self_describe_text:
            this.state.registerPatientForm.get('preferSelfDescribe')?.value,
        })
        .subscribe(
          (result: FullPatientDto) => {
            if (result) {
              this.toastr.success('Patient registered successfully!');
              this.router.navigate([
                `/${stringsConfig.clientRoutes.generalManager}`,
              ]);
            }
          },
          (error) => {
            this.toastr.error(error.error.message || error.statusText);
          }
        )
    );
  }

  ngOnDestroy(): void {
    this.state.subscription.unsubscribe();
  }
}
