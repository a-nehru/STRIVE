import { CreateDateColumn, UpdateDateColumn } from 'typeorm';

export class EmbeddedAuditDates {
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
