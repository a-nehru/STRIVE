import { IPagination } from '@common-interfaces/pagination.interface';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsNumberString, IsOptional, ValidateNested } from 'class-validator';
import { RequestDto, RequestMetadata } from './request.dto';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class PaginatedRequestMetadata
  extends RequestMetadata
  implements IPagination
{
  @Expose()
  @IsOptional()
  @IsNumberString()
  @CustomApiProperty()
  page?: number;

  @Expose()
  @IsOptional()
  @IsNumberString()
  @CustomApiProperty()
  pageSize?: number;
}

/**
 * This class stores some common information related to requests
 * sent from the client to the server.
 *
 * Every DTO that has to be sent to the server, should extends this
 * class.
 */
export abstract class PaginatedRequestDto extends RequestDto {
  abstract data: any;

  @Expose()
  @IsOptional()
  @Type(() => PaginatedRequestMetadata)
  @ValidateNested()
  @CustomApiProperty()
  metadata?: PaginatedRequestMetadata;
}
