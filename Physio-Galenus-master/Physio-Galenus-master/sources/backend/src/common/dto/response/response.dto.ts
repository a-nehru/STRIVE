import { Exclude, Expose, Type } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

export interface IResponse {
  data: any | any[];
  metadata?: ResponseMetadata;
}

@Exclude()
export class ResponseMetadata {}

/**
 * This class stores some common information related to responses
 * sent from the server to the client.
 *
 * Every DTO that has to be returned to the client, should extends this
 * class.
 */
export abstract class ResponseDto implements IResponse {
  abstract data: any;

  @Expose()
  @IsOptional()
  @Type(() => ResponseMetadata)
  @CustomApiProperty()
  metadata?: ResponseMetadata;
}
