import {
  AfterViewInit,
  Directive,
  ElementRef,
  Input,
  OnChanges,
  Optional,
  Renderer2,
  Self,
  SimpleChanges,
} from '@angular/core';
import { AuthService } from '@client-services/auth.service';
import { logDebug } from '../utils/log';
import { checkPermissions, IPermission } from '@common/permissions';
import { MatRadioButton } from '@angular/material/radio';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatButton } from '@angular/material/button';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatDatepickerToggle } from '@angular/material/datepicker';

const DISABLED = 'disabled';

@Directive({
  selector: '[appIfPermissionsEnable]',
})
export class PermissionsDisableDirective implements AfterViewInit, OnChanges {
  @Input() appIfPermissionsEnable: IPermission[];

  showComponent = true;
  permissionsLeft = '';

  private matComponents: (
    | MatRadioButton
    | MatCheckbox
    | MatButton
    | MatInput
    | MatSelect
    | MatDatepickerToggle<any>
  )[] = [];
  constructor(
    @Optional() @Self() private matRadio: MatRadioButton,
    @Optional() @Self() private matCheckbox: MatCheckbox,
    @Optional() @Self() private button: MatButton,
    @Optional() @Self() private input: MatInput,
    @Optional() @Self() private select: MatSelect,
    @Optional() @Self() private toogle: MatDatepickerToggle<any>,
    private eleRef: ElementRef,
    private renderer: Renderer2,
    private authService: AuthService
  ) {
    if (this.matComponents) {
      if (matRadio) {
        this.matComponents.push(this.matRadio);
      }
      if (matCheckbox) {
        this.matComponents.push(this.matCheckbox);
      }
      if (button) {
        this.matComponents.push(this.button);
      }
      if (input) {
        this.matComponents.push(this.input);
      }
      if (select) {
        this.matComponents.push(this.select);
      }
      if (toogle) {
        this.matComponents.push(this.toogle);
      }
    }
  }
  ngOnChanges(changes: SimpleChanges): void {
    const user = this.authService.userSubject.value;
    const permissions = checkPermissions(user, this.appIfPermissionsEnable);
    this.showComponent = permissions.length === 0;
    this.permissionsLeft = this.formatPermissions(permissions);
    this.disableElement(this.eleRef.nativeElement);
  }

  ngAfterViewInit(): void {}

  formatPermissions(
    permissions: { permissionId: string; missingActions: string[] }[]
  ): string {
    let permissionString = '';
    for (const permission of permissions) {
      permissionString =
        permissionString + 'Missing permission: ' + permission.permissionId;
      permissionString = permissionString + ' , Actions[';
      permissionString =
        permissionString + permission.missingActions.join(', ');
      permissionString = permissionString + ']' + '\n';
    }
    return permissionString;
  }

  private disableMatElements(): void {
    try {
      for (const matElem of this.matComponents) {
        if (matElem) {
          matElem.disabled = true;
        }
      }
    } catch (err) {
      logDebug(err);
    }
  }

  private disableElement(element: any): void {
    if (!this.showComponent) {
      this.disableMatElements();
      if (!element.hasAttribute(DISABLED)) {
        this.renderer.setAttribute(element, DISABLED, 'true');
        this.renderer.setAttribute(element, 'title', this.permissionsLeft);
      }
    }
    if (element.children) {
      for (const ele of element.children) {
        this.disableElement(ele);
      }
    }
  }
}
