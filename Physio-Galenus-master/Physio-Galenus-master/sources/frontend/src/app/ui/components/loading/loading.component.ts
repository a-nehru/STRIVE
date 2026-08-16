import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading',
  templateUrl: './loading.component.html',
  styleUrls: ['./loading.component.scss'],
})
export class LoadingComponent {
  @Input() isLoading: boolean;
  @Input() diameter = 100;
  @Input() strokeWidth = 10;
}
