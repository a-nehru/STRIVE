import { createReducer, on } from '@ngrx/store';
import { showLoading, hideLoading } from './shared-params.actions';

export type TState = { isLoading: boolean };

const initialState: Readonly<TState> = {
  isLoading: false,
};

export const reducer = createReducer(
  initialState,
  on(showLoading, (state) => ({ ...state, isLoading: true })),
  on(hideLoading, (state) => ({ ...state, isLoading: false }))
);
