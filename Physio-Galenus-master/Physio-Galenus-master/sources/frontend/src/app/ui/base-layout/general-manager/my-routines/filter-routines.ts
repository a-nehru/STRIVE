import { EDaysOfWeek } from '@common-enums/days-of-week.enum';
import { EFilterType, IFilterCriteria } from 'src/app/filter/filter-types';

export const filterRoutines: IFilterCriteria = {
  criteria: [
    {
      group: 'Filters',
      filters: [
        {
          name: 'Routine Name',
          filter: 'name',
          type: EFilterType.TextType,
        },
        {
          name: 'Routine Start Date',
          filter: 'routineStartDate',
          type: EFilterType.DateType,
        },
        {
          name: 'Routine End Date',
          filter: 'routineEndDate',
          type: EFilterType.DateType,
        },
        {
          name: 'Days of Week',
          filter: 'daysOfWeek',
          type: EFilterType.SelectType,
          options: {
            isMultiple: true,
          },
          resource: {
            callback: () =>
              Object.entries(EDaysOfWeek).map((value, _) => ({
                id: value[1],
                content: value[0],
              })),
          },
        },
      ],
    },
  ],
};
