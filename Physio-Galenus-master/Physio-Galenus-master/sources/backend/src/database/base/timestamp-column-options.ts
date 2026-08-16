import { ColumnOptions } from 'typeorm';

/**
 * Default options for timestamp columns with the precision set to 3, i.e.,
 * the same precision as the javascript Date object.
 */
export const timestampColumnOptions: ColumnOptions = {
  type: 'timestamp',
  precision: 3,
};
