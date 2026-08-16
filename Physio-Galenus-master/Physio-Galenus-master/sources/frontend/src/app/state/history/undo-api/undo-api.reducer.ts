import { ActionReducer, createReducer, on } from '@ngrx/store';
import { createSaveApiAction } from './undo-api.actions';

type TValueAction = {
  [key: string]: any;
};

export type TStateAction = {
  id: string;
  value: TValueAction;
};

export type TState = {
  action: TStateAction;
  inverse: TStateAction;
};

const initialState: Readonly<TState> = {
  action: { id: '', value: {} },
  inverse: { id: '', value: {} },
};

/** High-Order reducer to reuse logic for other reducers based on undo actions. */
export const reducer = (actionType: string): ActionReducer<TState> =>
  createReducer(
    initialState,
    on(
      createSaveApiAction(actionType),
      (state, { type, ...history }) => history
    )
  );
