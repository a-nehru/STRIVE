import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';
import { EmbeddedAuditDates } from './embedded/embedded-audit-dates';
import { PrimaryGeneratedColumn } from 'typeorm/decorator/columns/PrimaryGeneratedColumn';
import { timestampColumnOptions } from '../base/timestamp-column-options';
import { IUser } from './user.entity';
import { EApiKeyQuotaReset } from '../../common/enums/api-key-quota-reset.enum';

export interface IApiKey {
  id: string;
  user: IUser;
  key: string;
  is_revoked?: boolean;
  description?: string;
  num_issued_requests?: bigint;
  quota?: bigint;
  quota_reset?: EApiKeyQuotaReset;
  audit_dates?: EmbeddedAuditDates;
}

@Entity()
export class ApiKey implements IApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The related user for this API key; API keys cannot exist without a linked user because they have the information
   * related to roles and permissions, and some services require details about the user creating/updating resources.
   */
  @OneToOne('User', 'apiKey', { onDelete: 'CASCADE' })
  @JoinColumn()
  user: IUser;

  /**
   * The actual API key to include in network requests.
   * Note: it needs to be nullable because the database has to generate the ID using the uuid_generate_v4() function.
   */
  @Index()
  @Column({ type: 'varchar', length: 40, unique: true, nullable: true })
  key: string;

  /**
   * If true, the API key won't be usable anymore
   */
  @Column('bool', { default: false })
  is_revoked?: boolean;

  /**
   * A short description of the purpose of this API key
   */
  @Column('text', { nullable: true })
  description?: string;

  /**
   * Number of issued requests using this API key
   */
  @Column('bigint', { default: BigInt(0) })
  num_issued_requests?: bigint;

  /**
   * Last time a request was issued with this API key
   */
  @Column({ ...timestampColumnOptions, nullable: true })
  last_issued_request_datetime: Date;

  /**
   * Maximum numbers of requests this API key can issue.
   * If null -> the API key can issue an unlimited number of requests.
   */
  @Column('bigint', { nullable: true })
  quota?: bigint;

  /**
   * Period of time when the quota limit will be reset
   */
  @Column('enum', { enum: EApiKeyQuotaReset, default: EApiKeyQuotaReset.None })
  quota_reset?: EApiKeyQuotaReset;

  @Column(() => EmbeddedAuditDates, { prefix: false })
  audit_dates?: EmbeddedAuditDates = new EmbeddedAuditDates();
}
