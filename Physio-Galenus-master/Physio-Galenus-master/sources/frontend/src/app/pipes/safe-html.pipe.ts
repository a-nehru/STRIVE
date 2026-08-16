import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * This pipe prevents security issues when using `[innerHtml]`.
 * More information at https://angular.io/api/platform-browser/DomSanitizer.
 */
@Pipe({ name: 'safeHtml' })
export class SafeHtmlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}

  transform(style: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(style);
  }
}
