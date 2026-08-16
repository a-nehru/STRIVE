import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '@client-services/auth.service';
import { ChangelogService } from '@client-services/changelog.service';
import { appConfig } from '@config/app.config';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { DialogChangelogComponent } from '../components/dialog-changelog/dialog-changelog.component';

@Component({
  selector: 'app-base-layout',
  templateUrl: './base-layout.component.html',
  styleUrls: ['./base-layout.component.scss'],
})
export class BaseLayoutComponent implements OnInit {
  isHandset$: Observable<boolean>;

  appVersion = appConfig.version;

  constructor(
    private dialog: MatDialog,
    private breakpointObserver: BreakpointObserver,
    private authService: AuthService,
    private changelogService: ChangelogService
  ) {
    this.isHandset$ = this.breakpointObserver.observe(Breakpoints.Handset).pipe(
      map((result) => result.matches),
      shareReplay()
    );
  }

  ngOnInit(): void {
    if (this.authService.userSubject.value?.is_demo) {
      return;
    }

    let latestKnownAppVersion = localStorage.getItem('latestKnownAppVersion');
    if (!latestKnownAppVersion) {
      // Just to not crash on the .split below if this variable is undefined
      latestKnownAppVersion = '0.0.0+build00000000T000000.000';
    }

    // Show the changelog modal only when the X.Y.Z part of the version number changes; ignore the +buildXXXXX part
    if (this.appVersion.split('+')[0] !== latestKnownAppVersion.split('+')[0]) {
      this.changelogService
        .list({ data: { amount: appConfig.business.numberOfChangelogsToShow } })
        .subscribe(
          (changelog) => {
            localStorage.setItem('latestKnownAppVersion', appConfig.version);
            const modalRef = this.dialog.open(DialogChangelogComponent, {
              width: '800px',
            });
            modalRef.componentInstance.changelogs = changelog.data;
          },
          (error) => {
            console.error('Failed to fetch changelog', error);
            localStorage.setItem('latestKnownAppVersion', appConfig.version);
          }
        );
    }
  }
}
