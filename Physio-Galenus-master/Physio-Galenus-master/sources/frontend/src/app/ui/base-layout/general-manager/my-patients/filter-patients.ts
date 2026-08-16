import { EGender } from '@common-enums/gender.enum';
import { EFilterType, IFilterCriteria } from 'src/app/filter/filter-types';

export const filterPatients: IFilterCriteria = {
  criteria: [
    {
      group: 'Personal Information',
      filters: [
        {
          name: 'Date Of Birth',
          filter: 'birth_date',
          type: EFilterType.DateType,
        },
        {
          name: 'Gender',
          filter: 'gender',
          type: EFilterType.SelectType,
          resource: {
            callback: () =>
              Object.entries(EGender).map((value, _) => ({
                id: value[1],
                content: value[0],
              })),
          },
        },
      ],
    },
    {
      group: 'Contact Information',
      filters: [
        {
          name: 'Email',
          filter: 'email',
          type: EFilterType.TextType,
        },
      ],
    },
    {
      group: 'Other Information',
      filters: [
        {
          name: 'Public ID',
          filter: 'public_id',
          type: EFilterType.TextType,
        },
        {
          name: 'Nickname',
          filter: 'nickname',
          type: EFilterType.TextType,
        },
      ],
    },
  ],
};
