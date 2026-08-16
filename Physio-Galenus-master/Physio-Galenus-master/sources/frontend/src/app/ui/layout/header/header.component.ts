import { Component } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { stringsConfig } from '@config/strings.config';
import {
  EPermission,
  EPermissionAction,
  IPermission,
} from '@common/permissions';

export interface IHeader {
  displayName: string;
  link: string;
  icon: string;
  permissions?: IPermission[];
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {
  searchWord: string;
  showSearch = false;

  buttonList: IHeader[] = [
    {
      displayName: stringsConfig.clientServices.generalManager,
      link: stringsConfig.clientRoutes.generalManager,
      icon: 'manage_accounts',
    },
    {
      displayName: stringsConfig.clientServices.admin,
      link: stringsConfig.clientRoutes.admin,
      icon: 'settings',
      permissions: [
        { id: EPermission.SectionAdmin, actions: [EPermissionAction.Read] },
      ],
    },
  ];

  isHandset$: Observable<boolean> = this.breakpointObserver
    .observe(Breakpoints.Handset)
    .pipe(
      map((result) => result.matches),
      shareReplay()
    );

  constructor(private breakpointObserver: BreakpointObserver) {}

  search(): void {
    // TODO
  }
}
