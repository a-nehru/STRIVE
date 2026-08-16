export const appConfig = Object.freeze({
  /**
   * DO NOT MANUALLY CHANGE THE VERSION! It will be replaced by the `$ make release` script automatically
   */
  version: '0.4.1+build20240703T182718.119',
  auth: Object.freeze({
    pwdRecovertExpiredTime: { days: 2 } as Duration,
    verificationEmailExpirationTime: { days: 2 } as Duration,
    passwordsMaxHistory: 3, // Number of passwords to remember for a user (0 = no history at all)
  }),
  minimumLoadTimeInMs: 500,
  business: Object.freeze({
    numberOfChangelogsToShow: 5,
  }),
});
