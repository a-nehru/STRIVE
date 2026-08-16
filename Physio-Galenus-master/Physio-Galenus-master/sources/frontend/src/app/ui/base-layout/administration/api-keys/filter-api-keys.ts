import { EApiKeyQuotaReset } from '@common/enums/api-key-quota-reset.enum';
import { EFilterType, IFilterCriteria } from 'src/app/filter/filter-types';

export const filterApiKeys: IFilterCriteria = {
  criteria: [
    {
      group: 'Filters',
      filters: [
        {
          name: 'Key',
          filter: 'key',
          type: EFilterType.TextType,
        },
        {
          name: 'Username',
          filter: 'username',
          type: EFilterType.TextType,
        },
        {
          name: 'Is Revoked',
          filter: 'is_revoked',
          type: EFilterType.BooleanType,
        },
        {
          name: 'Quota Reset',
          filter: 'quota_reset',
          type: EFilterType.SelectType,
          resource: {
            callback: () =>
              Object.entries(EApiKeyQuotaReset).map((value, _) => ({
                id: value[1],
                content: value[0],
              })),
          },
        },
      ],
    },
  ],
};
