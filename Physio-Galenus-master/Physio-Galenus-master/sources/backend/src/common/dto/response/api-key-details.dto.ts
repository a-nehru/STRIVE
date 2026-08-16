import {
  Exclude,
  Expose,
  plainToClass,
  Transform,
  Type,
} from 'class-transformer';
import { ResponseDto } from './response.dto';
import { EApiKeyQuotaReset } from '../../enums/api-key-quota-reset.enum';
import { IApiKey } from '../../../database/entity';
import { FullUserDto } from './full-user.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
class DataDto {
  @Expose()
  @CustomApiProperty()
  readonly id: string;

  @Expose()
  @Transform(({ obj: { user } }: { obj: IApiKey }) =>
    plainToClass(FullUserDto, user),
  )
  @CustomApiProperty()
  readonly fullUser: FullUserDto;

  @Expose()
  @Transform(({ obj: { user } }: { obj: IApiKey }) => user.username)
  @CustomApiProperty()
  readonly username: string;

  @Expose()
  @CustomApiProperty()
  readonly key: string;

  @Expose()
  @CustomApiProperty()
  readonly is_revoked?: boolean;

  @Expose()
  @CustomApiProperty()
  readonly description?: string;

  @Expose()
  @CustomApiProperty()
  readonly num_issued_requests?: string;

  @Expose()
  @CustomApiProperty()
  readonly last_issued_request_datetime?: string;

  @Expose()
  @CustomApiProperty()
  readonly quota?: string;

  @Expose()
  @CustomApiProperty()
  readonly quota_reset?: EApiKeyQuotaReset;

  @Expose()
  @Transform(
    ({ obj: { audit_dates } }: { obj: IApiKey }) => audit_dates?.created_at,
  )
  @CustomApiProperty()
  readonly created_at: string;
}

@Exclude()
export class ApiKeyDetailsDto extends ResponseDto {
  @Expose()
  @Type(() => DataDto)
  @CustomApiProperty()
  data: DataDto;
}
