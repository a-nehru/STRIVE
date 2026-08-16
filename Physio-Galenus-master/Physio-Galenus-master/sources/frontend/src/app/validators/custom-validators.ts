import {
  AbstractControl,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { isDefined } from '@common/utils/is-defined';

const isEmpty = (control: AbstractControl) =>
  !isDefined(control.value) || control.value === '';

export class CustomValidators {
  static password(minLength = 10): ValidatorFn {
    return (control: AbstractControl): ValidationErrors => {
      const errors: ValidationErrors = {};

      if (isEmpty(control)) {
        return errors;
      }

      const password = control.value;
      if (password.length < minLength) {
        errors.password = {
          minLength,
        };
      }
      if (!password.match(/[A-Z]/)) {
        errors.password = {
          ...errors.password,
          uppercase: true,
        };
      }
      if (!password.match(/[^a-zA-Z]/)) {
        errors.password = {
          ...errors.password,
          nonletter: true,
        };
      }

      return errors;
    };
  }

  static mustMatchWith(otherControlName: string): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      return control.value === control.parent?.get(otherControlName)?.value
        ? null
        : { dontMatch: true };
    };
  }
  static mustMatchWithControl(otherControl: AbstractControl): ValidatorFn {
    return (control: AbstractControl): ValidationErrors => {
      const errors: ValidationErrors = {};

      if (isEmpty(control)) {
        return errors;
      }

      if (control.value !== otherControl.value) {
        errors.mustMatchWithControl = {
          otherControlValue: otherControl.value,
        };
      }

      return errors;
    };
  }
}
