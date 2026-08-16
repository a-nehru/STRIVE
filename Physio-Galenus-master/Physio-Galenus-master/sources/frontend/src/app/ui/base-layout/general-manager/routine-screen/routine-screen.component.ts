import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import { EDaysOfWeek } from '@common-enums/days-of-week.enum';
import { ExercisesService } from '@client-services/exercise.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ExerciseDetailsForListDtoData } from '@common-response-dto/exercise-details-for-list.dto';
import { RoutinesService } from '@client-services/routines.service';
import { ToastrService } from 'ngx-toastr';
import { FullRoutineDto } from '@common-response-dto/full-routine.dto';
import { UpsertRoutineDto } from '@common-request-dto/upsert-routine.dto';
import { UpsertRoutineToExerciseDto } from '@common-request-dto/upsert-routine-to-exercise.dto';
import { areArraysEqual } from '@common-utils/array-utils';
import { dateToLocalISOString } from '@common-utils/date-utils';
import { appConfig } from '@config/app.config';
import { switchMap, tap } from 'rxjs/operators';
import { EPermission, EPermissionAction } from '@common/permissions';
import { stringsConfig } from '@config/strings.config';
import { ConfirmDialogService } from '@client-services/confirm-dialog.service';

type TState = {
  heading: string;
  subheading: string;
  headingIcon: string;
  isLoading: boolean;
  routineForm: FormGroup;
  subscription: Subscription;
  exerciseSearchResults: ExerciseDetailsForListDtoData[];
  routine: FullRoutineDto | null;
};

@Component({
  selector: 'app-routine-screen',
  templateUrl: './routine-screen.component.html',
  styleUrls: ['./routine-screen.component.scss'],
})
export class RoutineScreenComponent implements OnInit, OnDestroy {
  private _editing = false;

  private dailyWeekdays: EDaysOfWeek[] = [
    EDaysOfWeek.Mon,
    EDaysOfWeek.Tue,
    EDaysOfWeek.Wed,
    EDaysOfWeek.Thu,
    EDaysOfWeek.Fri,
    EDaysOfWeek.Sat,
    EDaysOfWeek.Sun,
  ];
  private weekdayWeekdays: EDaysOfWeek[] = [
    EDaysOfWeek.Mon,
    EDaysOfWeek.Tue,
    EDaysOfWeek.Wed,
    EDaysOfWeek.Thu,
    EDaysOfWeek.Fri,
  ];

  state: TState = {
    heading: 'Enter a routine',
    subheading: 'Update or insert a routine with this form',
    headingIcon: 'fitness_center',
    isLoading: false,
    routine: null,
    routineForm: new FormGroup({}),
    subscription: new Subscription(),
    exerciseSearchResults: [],
  };

  imports = {
    Object,
    EDaysOfWeek,
  };

  searchControl: FormControl;

  createRoutinePermission = [
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Create] },
  ];
  editRoutinePermission = [
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Edit] },
  ];
  deleteRoutinePermission = [
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Delete] },
  ];
  searchExercisesPermission = [
    { id: EPermission.ManageExercises, actions: [EPermissionAction.List] },
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private exercisesService: ExercisesService,
    private routinesService: RoutinesService,
    private toastrService: ToastrService,
    private confirmDialogService: ConfirmDialogService
  ) {}

  get filteredExerciseResults(): ExerciseDetailsForListDtoData[] {
    return this.state.exerciseSearchResults.filter(
      (exercise) =>
        !this.exercises.controls.some(
          (addedExercise) =>
            addedExercise.get('exercise_id')?.value === exercise.id
        )
    );
  }

  get exercises(): FormArray {
    return this.state.routineForm.get('exercises') as FormArray;
  }

  get editing(): boolean {
    return this._editing;
  }

  set editing(value: boolean) {
    this._editing = value;
    if (value) {
      this.state.routineForm.enable();
    } else {
      this.state.routineForm.disable();
    }
  }

  ngOnInit(): void {
    this.state.routineForm = this.fb.group({
      name: [undefined, [Validators.required]],
      startDate: [undefined, [Validators.required]],
      endDate: [undefined, [Validators.required]],
      frequency: [undefined, [Validators.required]],
      dayMon: [undefined, []],
      dayTue: [undefined, []],
      dayWed: [undefined, []],
      dayThu: [undefined, []],
      dayFri: [undefined, []],
      daySat: [undefined, []],
      daySun: [undefined, []],
      exercises: this.fb.array([]),
    });
    this.searchControl = new FormControl(undefined, []);

    // Load default exercises
    let loadDataObservable: Observable<any> = this.exercisesService
      .list({
        data: {
          name: '',
        },
      })
      .pipe(
        tap(
          (result) => {
            this.state.exerciseSearchResults = result.data;
          },
          (error) => {
            this.toastr.error(error.error.message || error.statusText);
          }
        )
      );

    if (this.route.snapshot.params.id) {
      // Load routine data
      loadDataObservable = loadDataObservable.pipe(
        switchMap(() =>
          this.routinesService.fetch(this.route.snapshot.params.id)
        ),
        tap(
          (routine: FullRoutineDto) => {
            if (routine) {
              this.state.routine = routine;
              this.loadRoutineToForm(routine);
            }
          },
          (error) => {
            this.toastr.error(error.error.message || error.statusText);
          }
        )
      );
    }

    this.state.subscription.add(
      loadDataObservable.subscribe().add(async () => {
        await new Promise((f) => setTimeout(f, appConfig.minimumLoadTimeInMs));
        this.state.isLoading = false;
      })
    );
  }

  loadRoutineToForm(routine: FullRoutineDto): void {
    this.state.routineForm.patchValue({
      name: routine.name,
      startDate: new Date(routine.startDate),
      endDate: new Date(routine.endDate),
      ...this.loadRepetitionWeekdaysToForm(routine.repetitionWeekdays),
    });

    this.exercises.clear();
    routine.exercises.forEach((routineToExercise) => {
      this.exercises.push(
        this.fb.group({
          exercise_id: [routineToExercise.id, []],
          name: [routineToExercise.name, []],
          sets: [
            routineToExercise.sets,
            [Validators.required, Validators.min(1)],
          ],
          repetitions: [
            routineToExercise.reps,
            [Validators.required, Validators.min(1)],
          ],
          time: [
            routineToExercise.time,
            [Validators.required, Validators.min(1)],
          ],
          rest_between_sets: [
            routineToExercise.restBetweenSets,
            [Validators.required, Validators.min(1)],
          ],
        })
      );
    });
    this.editing = false;
  }

  loadRepetitionWeekdaysToForm(weekdays: EDaysOfWeek[]) {
    if (areArraysEqual(weekdays, this.dailyWeekdays)) {
      return {
        frequency: 'daily',
      };
    } else if (areArraysEqual(weekdays, this.weekdayWeekdays)) {
      return {
        frequency: 'weekdays',
      };
    } else {
      return {
        frequency: 'personalised',
        dayMon: weekdays.includes(EDaysOfWeek.Mon),
        dayTue: weekdays.includes(EDaysOfWeek.Tue),
        dayWed: weekdays.includes(EDaysOfWeek.Wed),
        dayThu: weekdays.includes(EDaysOfWeek.Thu),
        dayFri: weekdays.includes(EDaysOfWeek.Fri),
        daySat: weekdays.includes(EDaysOfWeek.Sat),
        daySun: weekdays.includes(EDaysOfWeek.Sun),
      };
    }
  }

  onSubmit(): void {
    if (!this.state.routineForm.valid) {
      this.toastr.error('There are invalid fields');
      return;
    }
    if (this.exercises.controls.length <= 0) {
      this.toastr.error('At least 1 exercise is required');
      return;
    }
    if (this.readRepetitionWeekdaysFromForm().length <= 0) {
      this.toastr.error('At least 1 day of the week is required');
      return;
    }

    this.state.isLoading = true;

    if (this.state.routine) {
      // Updating the routine
      this.state.subscription.add(
        this.routinesService
          .update(this.state.routine.id, this.readRoutineFromForm())
          .subscribe(
            (result: FullRoutineDto) => {
              this.state.routine = result;
              this.editing = false;
              this.toastr.success('Successfully updated routine');
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
    } else {
      // Creating the routine
      this.state.subscription.add(
        this.routinesService
          .insert(this.readRoutineFromForm())
          .subscribe(
            (result: FullRoutineDto) => {
              this.toastr.success('Successfully created routine');
              this.router.navigate([
                `general-manager/routines/details/${result.id}`,
              ]);
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

  readRoutineFromForm(): UpsertRoutineDto {
    const routine_to_exercise: UpsertRoutineToExerciseDto[] =
      this.exercises.controls.map((control) => {
        return {
          exercise_id: control.get('exercise_id')?.value,
          sets: control.get('sets')?.value,
          reps: control.get('repetitions')?.value,
          time: control.get('time')?.value,
          rest_between_sets: control.get('rest_between_sets')?.value,
        };
      });

    return {
      name: this.state.routineForm.get('name')?.value,
      start_date: dateToLocalISOString(
        this.state.routineForm.get('startDate')?.value
      ),
      end_date: dateToLocalISOString(
        this.state.routineForm.get('endDate')?.value
      ),
      repetition_weekdays: this.readRepetitionWeekdaysFromForm(),
      routine_to_exercise,
    };
  }

  readRepetitionWeekdaysFromForm(): EDaysOfWeek[] {
    switch (this.state.routineForm.get('frequency')?.value) {
      case 'daily': {
        return this.dailyWeekdays;
      }

      case 'weekdays': {
        return this.weekdayWeekdays;
      }

      case 'personalised': {
        const repetitionWeekdays: EDaysOfWeek[] = [];
        if (this.state.routineForm.get('dayMon')?.value) {
          repetitionWeekdays.push(EDaysOfWeek.Mon);
        }
        if (this.state.routineForm.get('dayTue')?.value) {
          repetitionWeekdays.push(EDaysOfWeek.Tue);
        }
        if (this.state.routineForm.get('dayWed')?.value) {
          repetitionWeekdays.push(EDaysOfWeek.Wed);
        }
        if (this.state.routineForm.get('dayThu')?.value) {
          repetitionWeekdays.push(EDaysOfWeek.Thu);
        }
        if (this.state.routineForm.get('dayFri')?.value) {
          repetitionWeekdays.push(EDaysOfWeek.Fri);
        }
        if (this.state.routineForm.get('daySat')?.value) {
          repetitionWeekdays.push(EDaysOfWeek.Sat);
        }
        if (this.state.routineForm.get('daySun')?.value) {
          repetitionWeekdays.push(EDaysOfWeek.Sun);
        }
        return repetitionWeekdays;
      }
    }
    return [];
  }

  onSearchExercises(): void {
    this.state.subscription.add(
      this.exercisesService
        .list({
          data: {
            name: this.searchControl.value,
          },
        })
        .subscribe((result) => {
          this.state.exerciseSearchResults = result.data;
        })
    );
  }

  addToList(exercise: ExerciseDetailsForListDtoData): void {
    this.exercises.push(
      this.fb.group({
        exercise_id: [exercise.id, []],
        name: [exercise.name, []],
        sets: [1, [Validators.required, Validators.min(1)]],
        repetitions: [10, [Validators.required, Validators.min(1)]],
        time: [120, [Validators.required, Validators.min(1)]],
        rest_between_sets: [15, [Validators.required, Validators.min(1)]],
      })
    );
  }

  async delete(): Promise<void> {
    if (
      !(await this.confirmDialogService.confirm(
        'Delete routine',
        'Are you sure you want to delete this routine?'
      ))
    ) {
      return;
    }

    if (!this.state.routine) {
      this.toastr.error('Delete routine', 'Cannot perform this operation');
      return;
    }

    this.state.isLoading = true;
    this.routinesService
      .delete(this.state.routine.id)
      .subscribe((deletedRoutine) => {
        this.toastrService.success(
          `Routine ${deletedRoutine.name} was successfully deleted`,
          'Routine deleted'
        );
        this.router.navigate(
          [
            `../../../${stringsConfig.sections.generalManager.routines.path}/${stringsConfig.sections.generalManager.routines.myRoutines.path}`,
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
