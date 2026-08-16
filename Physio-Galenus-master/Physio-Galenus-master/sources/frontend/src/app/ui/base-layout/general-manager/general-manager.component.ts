import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@client-services/auth.service';
import { StatisticsService } from '@client-services/statistics.service';
import { stringsConfig } from '@config/strings.config';
import {
  PatientSummarizedStatisticsDto,
  SummarizedStatisticsDto,
  TherapistSummarizedStatisticsDto,
} from '@common-response-dto/summarized-statistics.dto';
import {
  EPermission,
  EPermissionAction,
  IPermission,
} from '@common/permissions';
import { valueOrUnavailable } from '@common/utils/variable-utils';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';

type TState = {
  subscription: Subscription;
};

export interface ISidebarContent {
  icon: string;
  title: string;
  path: string;
  permissions?: IPermission[];
  children?: Omit<ISidebarContent, 'icon'>[];
}

@Component({
  selector: 'app-general-manager',
  templateUrl: './general-manager.component.html',
  styleUrls: ['./general-manager.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GeneralManagerComponent implements AfterViewChecked {
  @ViewChild('container') container: ElementRef;

  state: TState = {
    subscription: new Subscription(),
  };

  cards: {
    data: any;
    text: string;
    dataColor: string;
    textColor: string;
    backgroundColor: string;
    colspan: string;
    rowspan: string;
  }[];

  valueOrUnavailable = valueOrUnavailable;
  patientsByMonth: { name: string; value: number }[];
  patientsByYear: { name: string; value: number }[];

  patientStats: PatientSummarizedStatisticsDto;
  therapistStats: TherapistSummarizedStatisticsDto;
  breakpoint: number;
  breakpointCharts: number;

  constructor(
    public router: Router,
    private authService: AuthService,
    private statisticsService: StatisticsService,
    private toastr: ToastrService,
    private cdRef: ChangeDetectorRef
  ) {}

  ngAfterViewChecked(): void {
    this.onResize();
  }

  ngAfterContentChecked() {
    this.cdRef.detectChanges();
  }

  ngOnInit(): void {
    if (this.router.url === '/' + this.generalManagerRoute) {
      this.state.subscription.add(
        this.statisticsService
          .fetchSummarizedStatistics({
            therapistStatistics: true,
            patientStatistics: true,
            routineStatistics: true,
          })
          .subscribe(
            (stats: SummarizedStatisticsDto) => {
              const newCards: {
                data: any;
                text: string;
                dataColor: string;
                textColor: string;
                backgroundColor: string;
                colspan: string;
                rowspan: string;
              }[] = [];

              if (stats) {
                if (stats.therapistStatistics) {
                  if (!this.authService.userSubject.value?.is_demo) {
                    newCards.push({
                      data: valueOrUnavailable(
                        stats.therapistStatistics.princingPlan
                      ),
                      text: 'Pricing Plan',
                      dataColor: '#FFFFFF',
                      textColor: '#000000',
                      backgroundColor: '#FABB51',
                      colspan: '1',
                      rowspan: '1',
                    });
                  }
                  this.therapistStats = stats.therapistStatistics;
                }

                if (stats.patientStatistics) {
                  newCards.push({
                    data: valueOrUnavailable(
                      stats.patientStatistics.numberOfPatients
                    ),
                    text: 'Number of Patients',
                    dataColor: '#FFFFFF',
                    textColor: '#000000',
                    backgroundColor: '#FF87CA',
                    colspan: '1',
                    rowspan: '1',
                  });

                  newCards.push({
                    data: valueOrUnavailable(
                      stats.patientStatistics.newPatientsThisMonth
                    ),
                    text: 'New Patients This Month',
                    dataColor: '#FFFFFF',
                    textColor: '#000000',
                    backgroundColor: '#FF87CA',
                    colspan: '1',
                    rowspan: '1',
                  });

                  newCards.push({
                    data: valueOrUnavailable(
                      stats.patientStatistics.newPatientsLastMonth
                    ),
                    text: 'New Patients Last Month',
                    dataColor: '#FFFFFF',
                    textColor: '#000000',
                    backgroundColor: '#FF87CA',
                    colspan: '1',
                    rowspan: '1',
                  });

                  newCards.push({
                    data: valueOrUnavailable(
                      stats.patientStatistics.newPatientsThisYear
                    ),
                    text: 'New Patients This Year',
                    dataColor: '#FFFFFF',
                    textColor: '#000000',
                    backgroundColor: '#FF87CA',
                    colspan: '1',
                    rowspan: '1',
                  });

                  newCards.push({
                    data: valueOrUnavailable(
                      stats.patientStatistics.newPatientsLastYear
                    ),
                    text: 'New Patients Last Year',
                    dataColor: '#FFFFFF',
                    textColor: '#000000',
                    backgroundColor: '#FF87CA',
                    colspan: '1',
                    rowspan: '1',
                  });

                  this.patientStats = stats.patientStatistics;
                  this.patientsByMonth = [
                    {
                      name: 'Last Month',
                      value: stats.patientStatistics.newPatientsLastMonth,
                    },
                    {
                      name: 'This Month',
                      value: stats.patientStatistics.newPatientsThisMonth,
                    },
                  ];
                  this.patientsByYear = [
                    {
                      name: 'Last Year',
                      value: stats.patientStatistics.newPatientsLastYear,
                    },
                    {
                      name: 'This Year',
                      value: stats.patientStatistics.newPatientsThisYear,
                    },
                  ];
                }

                if (stats.routineStatistics) {
                  newCards.push({
                    data: valueOrUnavailable(
                      stats.routineStatistics.numberOfRoutines
                    ),
                    text: 'Number of Routines',
                    dataColor: '#FFFFFF',
                    textColor: '#000000',
                    backgroundColor: '#40E0D0',
                    colspan: '1',
                    rowspan: '1',
                  });
                }
              }
              this.cards = newCards;
            },
            (error) => {
              this.toastr.error(error.error.message || error.statusText);
            }
          )
      );
    }
  }

  static readonly sidebarContent: ISidebarContent[] = [
    {
      icon: 'people',
      title: 'Patients',
      path: 'patients',
      children: [
        {
          title: 'My Patients',
          path: `/${stringsConfig.clientRoutes.generalManager}/${stringsConfig.sections.generalManager.patients.myPatients.path}`,
          permissions: [
            {
              id: EPermission.SectionPatientsMyPatients,
              actions: [EPermissionAction.Read],
            },
          ],
        },
        {
          title: 'Create new patient',
          path: `/${stringsConfig.clientRoutes.generalManager}/${stringsConfig.sections.generalManager.patients.registerPatient.path}`,
          permissions: [
            {
              id: EPermission.SectionPatientsAddPatient,
              actions: [EPermissionAction.Read],
            },
          ],
        },
      ],
    },
    {
      icon: 'fitness_center',
      title: 'Routines',
      path: 'routines',
      children: [
        {
          title: 'My Routines',
          path: `/${stringsConfig.clientRoutes.generalManager}/${stringsConfig.sections.generalManager.routines.path}/${stringsConfig.sections.generalManager.routines.myRoutines.path}`,
          permissions: [
            {
              id: EPermission.SectionRoutinesMyRoutines,
              actions: [EPermissionAction.Read],
            },
          ],
        },
        {
          title: 'Create new routine',
          path: `/${stringsConfig.clientRoutes.generalManager}/${stringsConfig.sections.generalManager.routines.path}/${stringsConfig.sections.generalManager.routines.routineScreen.path}`,
          permissions: [
            {
              id: EPermission.SectionRoutinesAddRoutine,
              actions: [EPermissionAction.Read],
            },
          ],
        },
      ],
    },
  ];

  get generalManagerRoute(): string {
    return stringsConfig.clientRoutes.generalManager;
  }

  onResize(): void {
    if (this.container && this.container.nativeElement) {
      this.breakpoint = Math.ceil(
        this.container.nativeElement.offsetWidth / 450
      );
      this.breakpointCharts = Math.ceil(
        this.container.nativeElement.offsetWidth / 600
      );
    }
  }

  ngOnDestroy(): void {
    this.state.subscription.unsubscribe();
  }
}
