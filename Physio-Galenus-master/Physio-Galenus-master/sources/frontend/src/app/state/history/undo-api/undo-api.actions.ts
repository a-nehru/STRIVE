import { createAction, props } from '@ngrx/store';
import { TState } from './undo-api.reducer';

/* High-Order Actions */

export const createUndoApiAction = (actionType: string) =>
  createAction(actionType);

export const createSaveApiAction = (actionType: string) =>
  createAction(actionType, props<Readonly<TState>>());
