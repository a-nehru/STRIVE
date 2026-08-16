import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { AuthService } from '@client-services/auth.service';
import { ChangelogService } from '@client-services/changelog.service';
import { appConfig } from '@config/app.config';
import { Observable, Subscription } from 'rxjs';
import { filter, map, shareReplay } from 'rxjs/operators';
import { ISidebarContent } from '../../base-layout/general-manager';
import { DialogChangelogComponent } from '../../components/dialog-changelog/dialog-changelog.component';

@Component({
  selector: 'app-side-navbar',
  templateUrl: './side-navbar.component.html',
  styleUrls: ['./side-navbar.component.scss'],
})
export class SideNavbarComponent implements OnInit, OnDestroy {
  private _routerSub = Subscription.EMPTY;

  isHandset$: Observable<boolean>;

  sidebarContent: ISidebarContent[];

  navItemOpened: number;

  appVersion = appConfig.version;

  constructor(
    private router: Router,
    private dialog: MatDialog,
    private activatedRoute: ActivatedRoute,
    private authService: AuthService,
    private changelogService: ChangelogService,
    private breakpointObserver: BreakpointObserver
  ) {
    this.isHandset$ = this.breakpointObserver.observe(Breakpoints.Handset).pipe(
      map((result) => result.matches),
      shareReplay()
    );
  }

  ngOnInit(): void {
    this._routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.initializeSidebarState());
    this.initializeSidebarState();
  }

  private initializeSidebarState(): void {
    this.sidebarContent =
      this.activatedRoute?.snapshot?.firstChild?.data?.sidebarContent ??
      this.sidebarContent;
  }

  get isDemo(): boolean {
    return this.authService.userSubject.value?.is_demo;
  }

  showChangelog(): void {
    this.changelogService
      .list({ data: { amount: appConfig.business.numberOfChangelogsToShow } })
      .subscribe((changelog) => {
        const modalRef = this.dialog.open(DialogChangelogComponent, {
          width: '800px',
        });
        modalRef.componentInstance.changelogs = changelog.data;
      });
  }

  ngOnDestroy(): void {
    this._routerSub.unsubscribe();
  }
}
