import { Column, RelationOptions } from 'typeorm';

export const RelationIdColumn = (
  options: RelationOptions = { nullable: true },
) => Column(options);
