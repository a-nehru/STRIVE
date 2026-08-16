import { Component, OnDestroy, OnInit } from '@angular/core';
import { interval, Subscription } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { RoutinesService } from '@client-services/routines.service';
import { ToastrService } from 'ngx-toastr';
import { appConfig } from '@config/app.config';
import { RoutineDifficultyAdjustmentDto } from '@common-response-dto/routine-difficulty-adjustment.dto';
import { EPermission, EPermissionAction } from '@common/permissions';
import { isDefined } from '@common/utils/is-defined';
import {
  ICompactedExplanation,
  IExerciseExplanations,
  IExplanation,
  INewExerciseConfiguration,
} from '@common/interfaces/explanation.interface';
import { filter, concatMap, switchMap, take, tap } from 'rxjs/operators';
import * as _ from 'lodash';

type TState = {
  heading: string;
  subheading: string;
  headingIcon: string;
  isLoading: boolean;
  subscription: Subscription;
  difficultyAdjustment: RoutineDifficultyAdjustmentDto | null;
  isPerformingInference: boolean;
};

@Component({
  selector: 'app-routine-adjust-difficulty',
  templateUrl: './routine-adjust-difficulty.component.html',
  styleUrls: ['./routine-adjust-difficulty.component.scss'],
})
export class RoutineAdjustDifficultyComponent implements OnInit, OnDestroy {
  state: TState = {
    heading: 'Adjust Difficulty',
    subheading: 'Adjust the difficulty of a routine automatically',
    headingIcon: 'fitness_center',
    isLoading: false,
    subscription: new Subscription(),
    difficultyAdjustment: null,
    isPerformingInference: false,
  };

  imports = {
    Object,
    isDefined,
  };

  editRoutinePermission = [
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Edit] },
  ];
  readRoutinePermission = [
    { id: EPermission.ManageRoutines, actions: [EPermissionAction.Read] },
  ];

  constructor(
    private route: ActivatedRoute,
    private toastr: ToastrService,
    private routinesService: RoutinesService
  ) {}

  ngOnInit(): void {
    this.state.isLoading = true;

    this.state.subscription.add(
      this.routinesService
        .fetch(this.route.snapshot.params.id)
        .pipe(
          filter((routine) => isDefined(routine)),
          tap(
            (routine) =>
              (this.state.isPerformingInference = routine.isAdjustingDifficulty)
          ),
          concatMap((routine) =>
            this.routinesService.getRoutineDifficultyAdjustment(routine.id)
          )
        )
        .subscribe(
          (difficultyAdjustment) => {
            this.state.difficultyAdjustment = isDefined(
              difficultyAdjustment?.original_routine_id
            )
              ? difficultyAdjustment
              : null;

            if (
              this.state.isPerformingInference &&
              !this.state.difficultyAdjustment
            ) {
              this.startPolling();
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

  onPerformInference(): void {
    this.state.isPerformingInference = true;
    this.state.subscription.add(
      this.routinesService
        .adjustRoutineDifficulty(this.route.snapshot.params.id)
        .subscribe(
          () => {
            this.startPolling();
          },
          (error) => {
            this.state.isPerformingInference = false;
            this.toastr.error(error.error.message || error.statusText);
          }
        )
    );

    this.toastr.success(
      'The difficulty of the routine is being adjusted. You may wait in this page or come back later'
    );
  }

  private static readonly POLLING_INTERVAL_MS = 5000;
  private static readonly POLLING_MAX_ATTEMPTS = 60; // 5 minutes

  private startPolling(): void {
    const routineId = this.route.snapshot.params.id;

    this.state.subscription.add(
      interval(RoutineAdjustDifficultyComponent.POLLING_INTERVAL_MS)
        .pipe(
          take(RoutineAdjustDifficultyComponent.POLLING_MAX_ATTEMPTS),
          switchMap(() => this.routinesService.fetch(routineId)),
          filter((routine) => !routine.isAdjustingDifficulty),
          take(1),
          switchMap(() =>
            this.routinesService.getRoutineDifficultyAdjustment(routineId)
          )
        )
        .subscribe(
          (difficultyAdjustment) => {
            this.state.difficultyAdjustment = isDefined(
              difficultyAdjustment?.original_routine_id
            )
              ? difficultyAdjustment
              : null;
            this.state.isPerformingInference = false;
          },
          (error) => {
            this.state.isPerformingInference = false;
            this.toastr.error(error.error.message || error.statusText);
          },
          () => {
            if (this.state.isPerformingInference) {
              this.state.isPerformingInference = false;
              this.toastr.warning(
                'The difficulty adjustment is taking longer than expected. You will be notified when it completes.'
              );
            }
          }
        )
    );
  }

  onDiscardAdjustment(): void {
    this.state.isLoading = true;
    this.state.subscription.add(
      this.routinesService
        .discardRoutineDifficultyAdjustment(this.route.snapshot.params.id)
        .subscribe(
          () => {
            this.state.difficultyAdjustment = null;
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

  onAcceptAdjustment(): void {
    this.state.isLoading = true;
    this.state.subscription.add(
      this.routinesService
        .acceptRoutineDifficultyAdjustment(this.route.snapshot.params.id)
        .subscribe(
          () => {
            this.state.difficultyAdjustment = null;
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

  getExerciseExplanations(exerciseId: string): IExplanation[] | undefined {
    return this.state.difficultyAdjustment?.exergame_explanations.find(
      (el) => el.exerciseId === exerciseId
    )?.explanations;
  }

  compactExplanations(
    explanations: IExplanation[] | undefined
  ): ICompactedExplanation[] {
    if (!explanations) {
      return [];
    }

    const compactedExplanations: ICompactedExplanation[] = [];
    explanations.forEach((explanation) => {
      const fusedExplanation = compactedExplanations.find(
        // eslint-disable-next-line prettier/prettier
        (el) => _.isEqual(
            [...el.antecedents].sort(),
            [...explanation.antecedents].sort()
          )
      );

      if (fusedExplanation) {
        fusedExplanation.consequents = [
          ...fusedExplanation.consequents,
          explanation.consequent,
        ];
      } else {
        compactedExplanations.push({
          antecedents: explanation.antecedents,
          consequents: [explanation.consequent],
        });
      }
    });
    return compactedExplanations;
  }

  getExerciseFromId(exerciseId: string): INewExerciseConfiguration | undefined {
    return this.state.difficultyAdjustment?.new_exercise_configurations.find(
      (el) => el.exerciseId === exerciseId
    );
  }

  getExerciseNames(exercises: IExerciseExplanations[]): string[] {
    return exercises
      .map((el) => this.getExerciseFromId(el.exerciseId)?.exercise?.name)
      .filter(isDefined);
  }

  getClusterRepresentativeId(cluster: number): string | undefined {
    const representativeId =
      this.state.difficultyAdjustment?.cluster_representative_exergame_ids &&
      this.state.difficultyAdjustment?.cluster_representative_exergame_ids[
        cluster
      ];

    return representativeId;
  }

  get explanationClusters(): Record<number, IExerciseExplanations[]> {
    return (
      this.state.difficultyAdjustment?.exergame_explanations.reduce(
        (acc, curr) => {
          const cluster = this.getExerciseExplanations(curr.exerciseId)
            ? curr.cluster
            : -2;

          if (acc[cluster]) {
            acc[cluster].push(curr);
          } else {
            acc[cluster] = [curr];
          }

          return acc;
        },
        {} as Record<number, IExerciseExplanations[]>
      ) || {}
    );
  }

  get explanationClustersItems(): {
    cluster: number;
    exercises: IExerciseExplanations[];
  }[] {
    return Object.entries(this.explanationClusters).map(([key, value]) => ({
      cluster: +key,
      exercises: value,
    }));
  }

  get explanationClustersIndexes(): number[] {
    return Array(Object.keys(this.explanationClusters).length)
      .fill(0)
      .map((_x, i) => i);
  }

  ngOnDestroy(): void {
    this.state.subscription.unsubscribe();
  }
}
