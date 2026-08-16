import { createSelector } from '@ngrx/store';
import * as fromRoot from '../../';

const selectSearch = (state: fromRoot.IState) => state.search;

const selectSharedParams = createSelector(
  selectSearch,
  (state) => state.sharedParams
);

export const selectIsLoading = createSelector(
  selectSharedParams,
  (state) => state.isLoading
);
