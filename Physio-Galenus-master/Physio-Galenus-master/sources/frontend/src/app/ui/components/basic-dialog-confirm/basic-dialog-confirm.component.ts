import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-basic-dialog-confirm',
  templateUrl: './basic-dialog-confirm.component.html',
  styleUrls: ['./basic-dialog-confirm.component.scss'],
})
export class BasicDialogConfirmComponent {
  @Input() textTitle = '';
  @Input() textBody = '';
  @Input() primaryButtonName = 'Accept';
  @Input() secondaryButtonName = 'Cancel';
  @Input() showModalCross = true;

  @Input() onClickPrimaryButtonCallback: () => void;
  @Input() onClickSecondaryButtonCallback: () => void;

  constructor() {}

  onClickPrimaryButton(): void {
    if (!this.onClickPrimaryButtonCallback) {
      return;
    }

    this.onClickPrimaryButtonCallback();
  }

  onClickSecondaryButton(): void {
    if (!this.onClickSecondaryButtonCallback) {
      return;
    }

    this.onClickSecondaryButtonCallback();
  }
}
