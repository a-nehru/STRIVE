import { Component, Input } from '@angular/core';
import { ChangelogService } from '@client-services/changelog.service';
import { IChangelog } from '@common-interfaces/changelog.interface';
import { appConfig } from '@config/app.config';

@Component({
  selector: 'app-dialog-changelog',
  templateUrl: 'dialog-changelog.component.html',
  styleUrls: ['dialog-changelog.component.scss'],
})
export class DialogChangelogComponent {
  @Input()
  changelogs: IChangelog[];

  isLoading = false;

  constructor(private changelogService: ChangelogService) {}

  exportToCsv(): void {
    this.isLoading = true;
    this.changelogService
      .download({
        data: {},
        metadata: {
          orderBy: { date: 'ASC' },
        },
      })
      .subscribe((changelog) =>
        this.openDownloadDialog(changelog.data, {
          filename: 'changelog.csv',
          type: 'text/csv',
        })
      )
      .add(async () => {
        await new Promise((f) => setTimeout(f, appConfig.minimumLoadTimeInMs));
        this.isLoading = false;
      });
  }

  private openDownloadDialog = (
    data: any,
    options?: { filename?: string; type?: string }
  ): void => {
    const blob = new Blob([data], { type: options?.type });
    const navigator = window.navigator as any;
    if (navigator.msSaveOrOpenBlob) {
      navigator.msSaveBlob(blob, options ? options.filename : null);
      return;
    }

    const elem = window.document.createElement('a');
    elem.href = window.URL.createObjectURL(blob);
    elem.download = options && options.filename ? options.filename : 'data';
    document.body.appendChild(elem);
    elem.click();
    document.body.removeChild(elem);
  };
}
