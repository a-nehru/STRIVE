import { Component, Input } from '@angular/core';
import { FormControl } from '@angular/forms';
import { EExplanationVariableData } from '@common-enums/explanation-variable.enum';
import { IExplanationClause } from '@common/interfaces/explanation.interface';

@Component({
  selector: 'app-difficulty-variable-display',
  templateUrl: './difficulty-variable-display.component.html',
  styleUrls: ['./difficulty-variable-display.component.scss'],
})
export class DifficultyVariableDisplayComponent {
  imports = {
    explanationVariableText: EExplanationVariableData,
  };

  @Input()
  clause: IExplanationClause;

  constructor() {}
}
