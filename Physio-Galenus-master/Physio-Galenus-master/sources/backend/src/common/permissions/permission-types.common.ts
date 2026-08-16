export interface IPermissionsSettings {
  bypassByOwnerIdParamName: string;
}

/**
 * Interface returned when getting metadata from the @Permissions(...) decorator
 */
export interface IPermissionsData {
  permissions: IPermission[];
  settings: IPermissionsSettings;
}

/**
 * Interface used for the @Permissions(...) decorator
 */
export interface IPermission {
  id: string;
  actions: EPermissionAction[];
}

export interface IPermissionCanAction {
  can_create: boolean;
  can_edit: boolean;
  can_read: boolean;
  can_delete: boolean;
  can_list: boolean;
}

export interface IPermissionHasAction {
  has_create_action: boolean;
  has_edit_action: boolean;
  has_read_action: boolean;
  has_delete_action: boolean;
  has_list_action: boolean;
}

/**
 * List of permission actions for using it everywhere when these names are required
 */
export enum EPermissionAction {
  Create = 'can_create',
  Edit = 'can_edit',
  Read = 'can_read',
  Delete = 'can_delete',
  List = 'can_list',
}

/**
 * Used to avoid repeating all the EPermissionAction properties when reusing
 * the same properties within a class
 */
export type PermissionActionType = {
  readonly [key in EPermissionAction]?: boolean;
};

/**
 * Full list of available permissions. These are the IDs that should be used
 * when querying the database or when referring the permissions from the client
 * or server source code.
 */
export enum EPermission {
  // SECTIONS
  SectionPatientsMyPatients = 'SECTION_PATIENTS_MY_PATIENTS',
  SectionPatientsAddPatient = 'SECTION_PATIENTS_ADD_PATIENT',
  SectionPatientsPatientProfile = 'SECTION_PATIENTS_PATIENT_PROFILE',
  SectionExercisesDetails = 'SECTION_EXERCISES_DETAILS',
  SectionRoutinesAddRoutine = 'SECTION_ROUTINES_ADD_ROUTINE',
  SectionRoutinesDetails = 'SECTION_ROUTINES_DETAILS',
  SectionRoutinesAdjustDifficulty = 'SECTION_ROUTINES_ADJUST_DIFFICULTY',
  SectionRoutinesMyRoutines = 'SECTION_ROUTINES_MY_ROUTINES',
  SectionAdmin = 'SECTION_ADMIN',
  SectionRoles = 'SECTION_ROLES',
  SectionUserMyProfile = 'SECTION_USER_MY_PROFILE',
  SectionResetPassword = 'SECTION_RESET_PASSWORD',
  SectionUserPolicies = 'SECTION_USER_POLICIES',
  SectionUserNotifications = 'SECTION_USER_NOTIFICATIONS',
  SectionPoliciesApiKeys = 'SECTION_POLICIES_API_KEYS',
  SectionPricingPlans = 'SECTION_PRICING_PLANS',

  // MANAGE ENTITIES
  ManageExercises = 'MANAGE_EXERCISES',
  ManagePatients = 'MANAGE_PATIENTS',
  ManageRoutines = 'MANAGE_ROUTINES',
  ManageUsers = 'MANAGE_USERS',
  ManageUserNotifications = 'MANAGE_USER_NOTIFICATION',
  ManageApiKeys = 'MANAGE_API_KEYS',
  ManagePricingPlans = 'MANAGE_PRICING_PLANS',

  // ADMIN
  ManageRoles = 'MANAGE_ROLES',
  ManageUserRoles = 'MANAGE_USER_ROLES',
  ManagePermissions = 'MANAGE_PERMISSIONS',
  ManageUserPermissions = 'MANAGE_USER_PERMISSIONS',

  // STATISTICS
  ManageSummarizedStatistics = 'MANAGE_SUMMARIZED_STATISTICS',

  // OTHERS
  ManageChangelog = 'MANAGE_CHANGELOG',
}
