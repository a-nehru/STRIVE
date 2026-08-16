export enum EApiKeyQuotaReset {
  /**
   * The API key quota limit won't be reset ever; if quota reached, the API key won't be able to issue new requests.
   */
  None = 'none',

  /**
   * The API key quota limit will be reset every 60 minutes
   */
  Hourly = 'hourly',

  /**
   * The API key quota limit will be reset every 24 hours
   */
  Daily = 'daily',

  /**
   * The API key quota limit will be reset every 7 days
   */
  Weekly = 'weekly',

  /**
   * The API key quota limit will be reset every 30 days
   */
  Monthly = 'monthly',
}
