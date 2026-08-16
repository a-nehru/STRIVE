import { Directive, Input, TemplateRef, ViewContainerRef } from '@angular/core';
import { hasPermissions, IPermission } from '@common/permissions';
import { AuthService } from '../services/auth.service';
@Directive({
  selector: '[appIfPermissionsShow]',
})
export class PermissionCheckDirective {
  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef,
    private authService: AuthService
  ) {}
  showComponent: boolean;
  @Input() test: boolean;

  @Input() set appIfPermissionsShow(permissions: IPermission[]) {
    const user = this.authService.userSubject.value;
    this.showComponent = hasPermissions(user, permissions);
    if (this.showComponent) {
      this.viewContainer.createEmbeddedView(this.templateRef);
    } else {
      this.viewContainer.clear();
    }
  }
  private _except: boolean;
  @Input()
  set appIfPermissionsShowExcept(value: boolean) {
    if (value) {
      if (!this.showComponent) {
        this.viewContainer.createEmbeddedView(this.templateRef);
      } else {
        this.viewContainer.clear();
      }
    }
  }
}
