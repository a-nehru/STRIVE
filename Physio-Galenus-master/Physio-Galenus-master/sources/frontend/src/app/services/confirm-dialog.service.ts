import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BasicDialogConfirmComponent } from '../ui/components/basic-dialog-confirm/basic-dialog-confirm.component';

// https://angular.io/guide/router#candeactivate-handling-unsaved-changes
/**
 * Async modal dialog service
 * DialogService makes this app easier to test by faking this service.
 */
@Injectable({
  providedIn: 'root',
})
export class ConfirmDialogService {
  /**
   * Ask user to confirm an action. `message` explains the action and choices.
   * Returns observable resolving to `true`=confirm or `false`=cancel
   */
  constructor(private dialog: MatDialog) {}

  async confirm(
    title: string,
    message: string,
    { cancelButtonTitle, acceptButtonTitle, showModalCross } = {
      cancelButtonTitle: 'Cancel',
      acceptButtonTitle: 'Accept',
      showModalCross: true,
    },
    disableClose = false
  ): Promise<boolean> {
    let confirmation = false;

    const dialogRef = this.dialog.open(BasicDialogConfirmComponent, {
      width: '600px',
      disableClose,
    });
    dialogRef.componentInstance.textBody = message;
    dialogRef.componentInstance.textTitle = title;
    dialogRef.componentInstance.showModalCross = showModalCross;
    dialogRef.componentInstance.primaryButtonName = acceptButtonTitle;
    dialogRef.componentInstance.secondaryButtonName = cancelButtonTitle;
    if (!acceptButtonTitle) {
      dialogRef.componentInstance.onClickPrimaryButtonCallback = () => {};
    } else {
      dialogRef.componentInstance.onClickPrimaryButtonCallback = () => {
        confirmation = true;
        dialogRef.close();
      };
    }
    if (!cancelButtonTitle) {
      dialogRef.componentInstance.onClickSecondaryButtonCallback = () => {};
    } else {
      dialogRef.componentInstance.onClickSecondaryButtonCallback = () => {
        confirmation = false;
        dialogRef.close();
      };
    }

    await dialogRef.afterClosed().toPromise();
    return confirmation;
  }
}
