import { Component, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { PlatformLocation } from '@angular/common';

@Component({
  selector: 'app-basic-modal-info-confirm',
  templateUrl: './basic-modal-info-confirm.component.html',
  styleUrls: ['./basic-modal-info-confirm.component.scss'],
})
export class BasicModalInfoConfirmComponent {
  @Input()
  public textTitle = '';

  @Input()
  public textBody = '';

  @Input()
  public primaryButtonName = 'Accept';

  @Input()
  public secondaryButtonName = 'Cancel';

  @Input()
  public showModalCross = true;

  @Input()
  public onClickPrimaryButtonCallback: () => void;

  @Input()
  public onClickSecondaryButtonCallback: () => void;

  constructor(
    public activeModal: NgbActiveModal,
    private platformLocation: PlatformLocation
  ) {
    platformLocation.onPopState(() => this.activeModal.close());
  }

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
