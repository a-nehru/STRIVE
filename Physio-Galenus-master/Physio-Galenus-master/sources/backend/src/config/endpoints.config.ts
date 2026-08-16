export const prefixEndpoint = 'api';

export const instanceHealthEndpoint = {
  // Top level
  $full: 'instance-health',
};

export const authEndpoint = {
  // Top level
  $full: 'auth',

  // Children
  login: {
    $part: 'login',
    get $full(): string {
      return `${authEndpoint.$full}/${authEndpoint.login.$part}`;
    },
  },
  patientLogin: {
    $part: 'patient-login',
    get $full(): string {
      return `${authEndpoint.$full}/${authEndpoint.patientLogin.$part}`;
    },
  },
  verifyEmail: {
    $part: 'verify-email',
    get $full(): string {
      return `${authEndpoint.$full}/${authEndpoint.verifyEmail.$part}`;
    },
  },
  callPasswordRecovery: {
    $part: 'call-password-recovery',
    get $full(): string {
      return `${authEndpoint.$full}/${authEndpoint.callPasswordRecovery.$part}`;
    },
  },
  resetPassword: {
    $part: 'reset-password',
    get $full(): string {
      return `${authEndpoint.$full}/${authEndpoint.resetPassword.$part}`;
    },
  },
  verifyPasswordRecovery: {
    $part: 'password-recovery',
    get $full(): string {
      return `${authEndpoint.$full}/${authEndpoint.verifyPasswordRecovery.$part}`;
    },
  },
  applyPasswordRecovery: {
    $part: 'apply-password-recovery',
    get $full(): string {
      return `${authEndpoint.$full}/${authEndpoint.applyPasswordRecovery.$part}`;
    },
  },
  logout: {
    $part: 'logout',
    get $full(): string {
      return `${authEndpoint.$full}/${authEndpoint.logout.$part}`;
    },
  },
};

export const patientsEndpoint = {
  // Top level
  $full: 'patients',
} as const;

export const routinesEndpoint = {
  // Top level
  $full: 'routines',
  routineData: {
    $part: 'routine-data',
    get $full(): string {
      return `${routinesEndpoint.$full}/${routinesEndpoint.routineData.$part}`;
    },
  },
  routineDifficultyAdjustment: {
    $part: 'difficulty-adjustment',
    get $full(): string {
      return `${routinesEndpoint.$full}/${routinesEndpoint.routineDifficultyAdjustment.$part}`;
    },
  },
  acceptAdjustment: {
    $part: 'accept-adjustment',
    get $full(): string {
      return `${routinesEndpoint.$full}/${routinesEndpoint.acceptAdjustment.$part}`;
    },
  },
  discardAdjustment: {
    $part: 'discard-adjustment',
    get $full(): string {
      return `${routinesEndpoint.$full}/${routinesEndpoint.discardAdjustment.$part}`;
    },
  },
  patient: {
    $part: 'patient',
    get $full(): string {
      return `${routinesEndpoint.$full}/${routinesEndpoint.patient.$part}`;
    },
    routine: {
      $part: 'routine',
      get $full(): string {
        return `${routinesEndpoint.patient.$part}/${routinesEndpoint.patient.routine.$part}`;
      },
    },
    routineProgress: {
      $part: 'routine-progress',
      get $full(): string {
        return `${routinesEndpoint.patient.$part}/${routinesEndpoint.patient.routineProgress.$part}`;
      },
    },
  },
} as const;

export const exercisesEndpoint = {
  // Top level
  $full: 'exercises',
  patient: {
    $part: 'patient',
    get $full(): string {
      return `${exercisesEndpoint.$full}/${exercisesEndpoint.patient.$part}`;
    },
    autonomous: {
      $part: 'autonomous',
      get $full(): string {
        return `${exercisesEndpoint.patient.$part}/${exercisesEndpoint.patient.autonomous.$part}`;
      },
    },
  },
} as const;

export const usersEndpoint = {
  // Top level
  $full: 'users',
  simple: {
    $part: 'simple',
    get $full(): string {
      return `${usersEndpoint.$full}/${usersEndpoint.simple.$part}`;
    },
  },
  listSimple: {
    $part: 'list-simple',
    get $full(): string {
      return `${usersEndpoint.$full}/${usersEndpoint.listSimple.$part}`;
    },
  },
} as const;

export const whitelistEndpoint = {
  // Top level
  $full: 'whitelist',
} as const;

export const personEndpoint = {
  // Top level
  $full: 'person',
} as const;

export const docsEndpoint = {
  // Top level
  $full: 'docs',
} as const;

export const aclEndpoint = {
  // Top level
  $full: 'acl',

  // Children
  permissions: {
    $part: 'permissions',
    get $full(): string {
      return `${aclEndpoint.$full}/${aclEndpoint.permissions.$part}`;
    },
  },
  roles: {
    $part: 'roles',
    get $full(): string {
      return `${aclEndpoint.$full}/${aclEndpoint.roles.$part}`;
    },
    permissions: {
      $part: 'permissions',
      get $full(): string {
        return `${aclEndpoint.roles.$full}/${aclEndpoint.roles.permissions.$part}`;
      },
    },
  },
} as const;

export const statisticsEndpoint = {
  // Top level
  $full: 'statistics',
} as const;

export const changelogEndpoint = {
  // Top level
  $full: 'changelog',

  // Children
  download: {
    $part: 'download',
    get $full(): string {
      return `${changelogEndpoint.$full}/${changelogEndpoint.download.$part}`;
    },
  },
} as const;

export const pricingPlanEndpoint = {
  // Top level
  $full: 'pricing-plan',

  // Children
  list: {
    $part: 'list',
    get $full(): string {
      return `${pricingPlanEndpoint.$full}/${pricingPlanEndpoint.list.$part}`;
    },
  },
} as const;

export const userNotifEndpoint = {
  // Top level
  $full: 'user-notifications',

  // Children
  update: {
    $part: 'update',
    get $full(): string {
      return `${userNotifEndpoint.$full}/${userNotifEndpoint.update.$part}`;
    },
  },
  delete: {
    $part: 'delete',
    get $full(): string {
      return `${userNotifEndpoint.$full}/${userNotifEndpoint.delete.$part}`;
    },
  },
} as const;

export const apiKeysEndpoint = {
  // Top level
  $full: 'api-keys',

  // Children
  key: {
    $part: 'key',
  },
} as const;
