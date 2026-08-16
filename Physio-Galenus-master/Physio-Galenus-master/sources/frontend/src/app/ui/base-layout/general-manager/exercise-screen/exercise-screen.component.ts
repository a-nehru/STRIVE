import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { EPoseType } from '@common-enums/pose-type.enum';
import { EPoseSide } from '@common-enums/pose-side.enum';
import { EExerciseType } from '@common-enums/exercise-type.enum';
import { ExercisesService } from '@client-services/exercise.service';
import { FullExerciseDto } from '@common-response-dto/full-exercise.dto';
import { ELimb } from '@common-enums/limbs.enum';

type TState = {
  exerciseForm: FormGroup;
  subscription: Subscription;
  exerciseId: string;
};

@Component({
  selector: 'app-register-patient',
  templateUrl: './exercise-screen.component.html',
  styleUrls: ['./exercise-screen.component.scss'],
})
export class ExerciseScreenComponent implements OnInit {
  state: TState;
  imports: any;

  constructor(
    private fb: FormBuilder,
    private toastr: ToastrService,
    private route: ActivatedRoute,
    private exercisesService: ExercisesService
  ) {
    this.imports = {
      Object,
      EPoseType,
      EPoseSide,
      EExerciseType,
    };
  }

  ngOnInit(): void {
    this.state = {
      exerciseForm: this.fb.group({
        name: [undefined, [Validators.required]],
        limbLeftArm: [undefined, []],
        limbRightArm: [undefined, []],
        limbLeftLeg: [undefined, []],
        limbRightLeg: [undefined, []],
        poseType: [undefined, [Validators.required]],
        poseSide: [undefined, [Validators.required]],
        exerciseType: [undefined, [Validators.required]],
      }),
      subscription: new Subscription(),
      exerciseId: this.route.snapshot.params.id,
    };

    // Only in alpha version
    this.state.exerciseForm.disable();

    this.state.subscription.add(
      this.exercisesService.fetch(this.state.exerciseId).subscribe(
        (exercise: FullExerciseDto) => {
          if (exercise) {
            this.state.exerciseForm.setValue({
              // TO DO: add limbs only if necessary
              name: exercise.name,
              poseType: exercise.poseType,
              poseSide: exercise.poseSide,
              exerciseType: exercise.type,
            });
          } else {
            this.toastr.error(
              `Exercise ${this.state.exerciseId} does not exist`
            );
          }
        },
        (error) => {
          this.toastr.error(error.error.message || error.statusText);
        }
      )
    );
  }

  async onSubmit(): Promise<void> {
    if (this.state.exerciseForm.invalid) {
      this.toastr.error('There are invalid fields');
      return;
    }
  }

  ngOnDestroy(): void {
    this.state.subscription.unsubscribe();
  }
}
