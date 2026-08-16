export const stringsConfig = {
  unavailableData: 'N/A',
  clientServices: {
    generalManager: 'Manager',
    routines: 'Routines',
    admin: 'Administration',
  },
  clientRoutes: {
    generalManager: 'general-manager',
    admin: 'admin',
    profile: 'profile',
  },
  sections: {
    generalManager: {
      patients: {
        path: 'patients',
        myPatients: {
          title: 'My Patients',
          path: 'my-patients',
        },
        registerPatient: {
          title: 'Register Patient',
          path: 'register-patient',
        },
        patientProfile: {
          title: 'Patient Profile',
          path: 'details/:id',
        },
      },
      exercises: {
        path: 'exercises',
        exerciseScreen: {
          path: 'details/:id',
        },
      },
      routines: {
        path: 'routines',
        routineScreen: {
          title: 'Create Routine',
          path: 'create-routine',
        },
        routineDetails: {
          path: 'details/:id',
        },
        routineAdjustDifficulty: {
          path: 'adjust-difficulty/:id',
        },
        myRoutines: {
          title: 'My Routines',
          path: 'my-routines',
        },
      },
      user: {
        path: 'user',
        userProfile: {
          path: 'profile',
          title: 'My Profile',
        },
      },
    },
    admin: {
      policies: {
        roles: {
          title: 'Roles',
          path: 'roles',
        },
        users: {
          title: 'Users',
          path: 'users',
        },
        apiKeys: {
          title: 'Api Keys',
          path: 'api-keys',
        },
      },
    },
    profile: {
      user: {
        myProfile: {
          title: 'My Profile',
          path: 'my-profile',
        },
        resetPassword: {
          title: 'Reset Password',
          path: 'reset-password',
        },
      },
      notifications: {
        userNotifications: {
          title: 'User Notifications',
          path: 'user-notifications',
        },
        removedNotifications: {
          title: 'Removed Notifications',
          path: 'removed-notifications',
        },
      },
    },
  },
} as const;
