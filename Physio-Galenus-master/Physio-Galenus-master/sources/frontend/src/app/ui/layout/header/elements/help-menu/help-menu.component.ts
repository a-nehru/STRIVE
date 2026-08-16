import { Component } from '@angular/core';
import { AuthService } from '@client-services/auth.service';

interface IMenuItem {
  title: string;
  link: string;
  icon?: string;
  hideFromDemo?: boolean;
}

interface IMenu {
  header: string;
  entries: IMenuItem[];
}

@Component({
  selector: 'app-help-menu',
  templateUrl: './help-menu.component.html',
  styleUrls: ['./help-menu.component.scss'],
})
export class HelpMenuComponent {
  menuList: IMenu[] = [
    {
      header: 'Information',
      entries: [
        {
          title: 'Blog',
          link: '',
        },
        {
          title: 'Plans & Pricings',
          link: 'pricing',
          hideFromDemo: true,
        },
      ],
    },
    {
      header: 'Legal',
      entries: [
        {
          title: 'Terms of Service',
          link: '',
        },
        {
          title: 'Privacy Policy',
          link: '',
        },
      ],
    },
  ];

  constructor(private authService: AuthService) {}

  get filteredMenuList(): IMenu[] {
    if (!this.authService.userSubject.value?.is_demo) {
      return this.menuList;
    }
    return this.menuList.map((menu) => ({
      ...menu,
      entries: menu.entries.filter((entry) => !entry.hideFromDemo),
    }));
  }
}
