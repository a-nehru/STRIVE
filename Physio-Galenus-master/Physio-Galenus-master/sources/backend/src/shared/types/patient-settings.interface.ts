/**
 * Interface used to store patient settings.
 */
export interface IPatientSettings {
  general: IGeneralSettings;
  // access management
  // etc.
}

/** Interface used to store general settings, e.g. notifications, account, etc. */
export interface IGeneralSettings {
  game: IGameSettings;
  // notifications
  // account
  // etc.
}

/** Interface used to store settings related to the patient app */
export interface IGameSettings {
  numDaysToShowSafetyGuides: number;
  numDaysToShowInstructions: number;
}