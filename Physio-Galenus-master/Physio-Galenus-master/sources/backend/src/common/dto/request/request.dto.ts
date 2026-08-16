import { IRequest } from '@common-request-dto-interfaces/request.interface';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CustomApiProperty } from '@custom-decorators/custom-api-property.decorator';

@Exclude()
export class RequestMetadata {
  @Expose()
  @IsOptional()
  @IsObject()
  @CustomApiProperty()
  orderBy?: {
    [columnName: string]:
      | ('ASC' | 'DESC')
      | {
          order: 'ASC' | 'DESC';
          nulls?: 'NULLS FIRST' | 'NULLS LAST';
        };
  };

  /**
   * Relations that can be joined directly through entity explicit relationships.
   */
  @Expose()
  @IsOptional()
  @IsString({ each: true })
  @CustomApiProperty()
  relations?: string[];

  /**
   * Isolated tables to joins. Must be supported in the backend manually.
   */
  @Expose()
  @IsOptional()
  @IsString({ each: true })
  @CustomApiProperty()
  links?: string[];
}

/**
 * This class stores some common information related to requests
 * sent from the client to the server.
 *
 * Every DTO that has to be sent to the server, should extends this
 * class.
 */
export abstract class RequestDto implements IRequest {
  abstract data: any | any[];

  @Expose()
  @IsOptional()
  @Type(() => RequestMetadata)
  @ValidateNested()
  @CustomApiProperty()
  metadata?: RequestMetadata;
}
