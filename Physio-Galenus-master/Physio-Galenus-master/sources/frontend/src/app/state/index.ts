import { ActionReducerMap } from '@ngrx/store';
import * as fromSearch from './search';
import * as fromHistory from './history';
import * as fromSections from './sections';

/**
 * Type that represents the structure of NgRx Store.
 * The approach to organize the objects used with NgRx follows the convention below:
 *
 * {
 *     simpleDomainData1: {....},
 *     simpleDomainData2: {....},
 *     entities : {
 *         entityType1 : {....},
 *         entityType2 : {....}
 *     },
 *     ui : {
 *         uiSection1 : {....},
 *         uiSection2 : {....}
 *     }
 * }
 */

export interface IState {
  search: fromSearch.IState;
  history: fromHistory.IState;
  sections: fromSections.IState;
}

export const reducers: ActionReducerMap<IState> = {
  search: fromSearch.reducer,
  history: fromHistory.reducer,
  sections: fromSections.reducer,
};
